// Users business logic: tenant-scoped CRUD plus hierarchy-based management
// (promote/demote/transfer). Two permission axes apply:
//   - listing/reading is company- (and for team roles, team-) scoped
//   - creating/editing/deleting/promoting/transferring a user requires the actor
//     to outrank the target in the reporting hierarchy (canManageUser)
// Password hashes are never returned, and every mutation writes an audit log.
import bcrypt from 'bcryptjs';
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import {
  type Actor,
  assertCanManageUser,
  canWrite,
  isCompanyWide,
  getManagedUserIds,
  getScopedTeamIds,
} from '../../utils/tenancy';
import type { UserRole } from '../../middleware/auth.middleware';
import type {
  ListUsersInput,
  CreateUserInput,
  UpdateUserInput,
  ChangeRoleInput,
  TransferUserInput,
} from './users.schema';

// Columns safe to return to API clients (excludes passwordHash).
const publicSelect = {
  id: true,
  companyId: true,
  teamId: true,
  reportsToUserId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type { Actor };

// Seniority rank used to bound role changes (you can only set roles below your
// own). super_admin is the only company-wide writer/manager.
const ROLE_RANK: Record<UserRole, number> = {
  platform_owner: 5,
  super_admin: 4,
  management_admin: 3,
  sales_manager: 2,
  sdr: 1,
};

export async function listUsers(params: ListUsersInput, actor: Actor) {
  const { page, limit, search, role, status } = params;

  // Company isolation. Company-wide roles (super_admin / management_admin) see
  // everyone; a manager sees only their reporting hierarchy (themselves + every
  // subordinate), never peers or other managers' teams.
  const hierarchy: Prisma.UserWhereInput = isCompanyWide(actor.role)
    ? {}
    : { id: { in: await getManagedUserIds(actor) } };

  const where: Prisma.UserWhereInput = {
    companyId: actor.companyId,
    ...hierarchy,
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUserById(id: string, actor: Actor) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) throw Errors.notFound('User not found');
  if (user.companyId !== actor.companyId) throw Errors.notFound('User not found');
  // A manager may only view users inside their reporting hierarchy (incl. self).
  if (!isCompanyWide(actor.role)) {
    const managed = await getManagedUserIds(actor);
    if (!managed.includes(user.id)) throw Errors.notFound('User not found');
  }
  return user;
}

export async function createUser(input: CreateUserInput, actor: Actor) {
  // Only writers may create users. A sales_manager may only create sdrs within
  // their own team; super_admin may create any role in the company.
  if (!canWrite(actor.role)) {
    throw Errors.forbidden('Your role may not create users');
  }
  if (actor.role === 'sales_manager') {
    if (input.role !== 'sdr') {
      throw Errors.forbidden('A sales manager may only create SDR users');
    }
  }

  const teamId = input.teamId ?? actor.teamId;
  const reportsToUserId = input.reportsToUserId ?? actor.id;

  // A manager may only place new users in a team they manage and reporting to
  // someone within their own hierarchy (themselves or a subordinate).
  if (!isCompanyWide(actor.role)) {
    const scopedTeams = await getScopedTeamIds(actor);
    if (teamId && scopedTeams && !scopedTeams.includes(teamId)) {
      throw Errors.forbidden('You can only place users in a team you manage');
    }
    const managed = await getManagedUserIds(actor);
    if (!managed.includes(reportsToUserId)) {
      throw Errors.forbidden('New users must report to you or someone in your hierarchy');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        status: input.status,
        companyId: actor.companyId,
        teamId,
        reportsToUserId,
      },
      select: publicSelect,
    });

    await writeAuditLog({
      entityType: 'user',
      entityId: user.id,
      action: 'user.create',
      actorType: 'user',
      actorId: actor.id,
      companyId: actor.companyId,
      summary: `Created user ${user.email} (${user.role})`,
      ipAddress: actor.ipAddress,
    });

    return user;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Errors.conflict('A user with that email already exists');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput, actor: Actor) {
  // Must be able to manage this user (hierarchy). Self-edit of basic profile is
  // out of scope here; role/status changes always require management authority.
  await assertCanManageUser(actor, id);

  // Bound any role change to strictly below the actor's own rank.
  if (input.role !== undefined && ROLE_RANK[input.role] >= ROLE_RANK[actor.role]) {
    throw Errors.forbidden('You cannot assign a role at or above your own');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status;
  if (input.password !== undefined) {
    data.passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  }

  try {
    const user = await prisma.user.update({ where: { id }, data, select: publicSelect });
    const changedFields = Object.keys(input);
    await writeAuditLog({
      entityType: 'user',
      entityId: user.id,
      action: 'user.update',
      actorType: 'user',
      actorId: actor.id,
      companyId: actor.companyId,
      summary: `Updated user ${user.email}: ${changedFields.join(', ')}`,
      payload: { changedFields },
      ipAddress: actor.ipAddress,
    });
    return user;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Errors.conflict('A user with that email already exists');
    }
    throw err;
  }
}

// Promote / demote a subordinate to a new role (bounded below the actor's rank).
export async function changeUserRole(id: string, input: ChangeRoleInput, actor: Actor) {
  await assertCanManageUser(actor, id);
  if (ROLE_RANK[input.role] >= ROLE_RANK[actor.role]) {
    throw Errors.forbidden('You cannot assign a role at or above your own');
  }
  const user = await prisma.user.update({
    where: { id },
    data: { role: input.role },
    select: publicSelect,
  });
  await writeAuditLog({
    entityType: 'user',
    entityId: id,
    action: 'user.role_change',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Changed role of ${user.email} to ${input.role}`,
    payload: { role: input.role },
    ipAddress: actor.ipAddress,
  });
  return user;
}

// Transfer a subordinate to another team, optionally re-pointing their manager.
// A manager is confined to their own scope: the destination must be a team they
// manage, and the new reporting line must stay inside their hierarchy — so a
// manager can never push a user into (or under) another manager's team. Role
// elevation is separately blocked by changeUserRole's rank check.
export async function transferUser(id: string, input: TransferUserInput, actor: Actor) {
  await assertCanManageUser(actor, id);
  const companyWide = isCompanyWide(actor.role);
  const scopedTeams = companyWide ? null : await getScopedTeamIds(actor);
  const managed = companyWide ? null : await getManagedUserIds(actor);

  if (input.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { companyId: true },
    });
    if (!team || team.companyId !== actor.companyId) {
      throw Errors.badRequest('Target team is not in your company');
    }
    if (scopedTeams && !scopedTeams.includes(input.teamId)) {
      throw Errors.forbidden('You can only transfer users into a team you manage');
    }
  }
  if (input.reportsToUserId) {
    const mgr = await prisma.user.findUnique({
      where: { id: input.reportsToUserId },
      select: { companyId: true },
    });
    if (!mgr || mgr.companyId !== actor.companyId) {
      throw Errors.badRequest('Target manager is not in your company');
    }
    if (managed && !managed.includes(input.reportsToUserId)) {
      throw Errors.forbidden('You can only reassign reporting to yourself or someone in your hierarchy');
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      teamId: input.teamId,
      ...(input.reportsToUserId !== undefined
        ? { reportsToUserId: input.reportsToUserId }
        : {}),
    },
    select: publicSelect,
  });
  await writeAuditLog({
    entityType: 'user',
    entityId: id,
    action: 'user.transfer',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Transferred ${user.email} to team ${input.teamId ?? 'none'}`,
    payload: { teamId: input.teamId, reportsToUserId: input.reportsToUserId },
    ipAddress: actor.ipAddress,
  });
  return user;
}

export async function deleteUser(id: string, actor: Actor) {
  if (id === actor.id) {
    throw Errors.badRequest('You cannot delete your own account');
  }
  await assertCanManageUser(actor, id);
  const user = await getUserById(id, actor);

  await prisma.user.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'user',
    entityId: id,
    action: 'user.delete',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Deleted user ${user.email}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
