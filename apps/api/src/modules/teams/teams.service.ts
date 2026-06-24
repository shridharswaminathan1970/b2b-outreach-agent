// Teams business logic. Teams are company-scoped. A team has a SALES_MANAGER
// (reporting head) and an OPTIONAL SDR team lead; when no lead is set the manager
// is the de-facto lead. SALES_MANAGER may create/manage their own team;
// SUPER_ADMIN manages all teams in the company. Assigned manager/lead users must
// belong to the same company.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import {
  type Actor,
  canWrite,
  isCompanyWide,
  isPlatformOwner,
  getScopedTeamIds,
  getManagedUserIds,
} from '../../utils/tenancy';
import type { ListTeamsInput, CreateTeamInput, UpdateTeamInput } from './teams.schema';

const teamInclude = {
  manager: { select: { id: true, name: true, email: true } },
  teamLead: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true } },
} satisfies Prisma.TeamInclude;

// Company isolation. platform_owner sees every company (optionally filtered).
// Company-wide roles see all teams in their company; a manager sees only teams
// inside their own scope — teams they or a subordinate manage, plus their own
// team — never another manager's team (getScopedTeamIds).
async function teamWhere(actor: Actor, companyId?: string): Promise<Prisma.TeamWhereInput> {
  if (isPlatformOwner(actor.role)) return companyId ? { companyId } : {};
  const scoped = await getScopedTeamIds(actor); // null = company-wide (no limit)
  return {
    companyId: actor.companyId,
    ...(scoped ? { id: { in: scoped } } : {}),
  };
}

export async function listTeams(params: ListTeamsInput, actor: Actor) {
  const { page, limit, search, companyId } = params;
  const where: Prisma.TeamWhereInput = {
    ...(await teamWhere(actor, companyId)),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.team.findMany({
      where,
      include: teamInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.team.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getTeamById(id: string, actor: Actor) {
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!team) throw Errors.notFound('Team not found');
  if (isPlatformOwner(actor.role)) return team; // cross-company: any team
  if (team.companyId !== actor.companyId) throw Errors.notFound('Team not found');
  // A manager may only access teams inside their own scope (theirs or a
  // subordinate's); other managers' teams are invisible.
  if (!isCompanyWide(actor.role)) {
    const scoped = await getScopedTeamIds(actor);
    if (scoped && !scoped.includes(team.id)) throw Errors.notFound('Team not found');
  }
  return team;
}

// Verify a referenced user belongs to `companyId` (the team's company), and — for
// a manager — that the user is within their own hierarchy (so a manager can't
// hand a team to someone outside their reporting line). Company-wide roles and
// the platform_owner skip the hierarchy check.
async function assertAssignableUser(userId: string, actor: Actor, companyId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  if (!u || u.companyId !== companyId) {
    throw Errors.badRequest('Referenced user is not in this team’s company');
  }
  if (!isCompanyWide(actor.role) && !isPlatformOwner(actor.role)) {
    const managed = await getManagedUserIds(actor);
    if (!managed.includes(userId)) {
      throw Errors.forbidden('You can only assign users within your own hierarchy');
    }
  }
}

export async function createTeam(input: CreateTeamInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create teams');

  // platform_owner creates into an explicit target company; everyone else into
  // their own.
  let companyId: string;
  if (isPlatformOwner(actor.role)) {
    if (!input.companyId) throw Errors.badRequest('companyId is required to create a team');
    companyId = input.companyId;
  } else {
    companyId = actor.companyId;
  }

  if (input.managerUserId) await assertAssignableUser(input.managerUserId, actor, companyId);
  if (input.teamLeadUserId) await assertAssignableUser(input.teamLeadUserId, actor, companyId);

  // A sales_manager creating a team becomes its manager by default.
  const managerUserId =
    input.managerUserId ?? (actor.role === 'sales_manager' ? actor.id : null);

  const team = await prisma.team.create({
    data: {
      companyId,
      name: input.name,
      department: input.department ?? null,
      managerUserId,
      teamLeadUserId: input.teamLeadUserId ?? null,
    },
    include: teamInclude,
  });

  await writeAuditLog({
    entityType: 'team',
    entityId: team.id,
    action: 'team.create',
    actorType: 'user',
    actorId: actor.id,
    companyId,
    summary: `Created team ${team.name}`,
    ipAddress: actor.ipAddress,
  });

  return team;
}

export async function updateTeam(id: string, input: UpdateTeamInput, actor: Actor) {
  const existing = await getTeamById(id, actor);
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not edit teams');

  // Referenced manager/lead must belong to this team's company.
  if (input.managerUserId) await assertAssignableUser(input.managerUserId, actor, existing.companyId);
  if (input.teamLeadUserId) await assertAssignableUser(input.teamLeadUserId, actor, existing.companyId);

  const team = await prisma.team.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId } : {}),
      ...(input.teamLeadUserId !== undefined ? { teamLeadUserId: input.teamLeadUserId } : {}),
    },
    include: teamInclude,
  });

  await writeAuditLog({
    entityType: 'team',
    entityId: team.id,
    action: 'team.update',
    actorType: 'user',
    actorId: actor.id,
    companyId: existing.companyId,
    summary: `Updated team ${team.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return team;
}

export async function deleteTeam(id: string, actor: Actor) {
  const team = await getTeamById(id, actor);
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not delete teams');

  const members = await prisma.user.count({ where: { teamId: id } });
  if (members > 0) {
    throw Errors.conflict(`Team has ${members} member(s); reassign them before deleting`);
  }

  await prisma.team.delete({ where: { id: team.id } });

  await writeAuditLog({
    entityType: 'team',
    entityId: id,
    action: 'team.delete',
    actorType: 'user',
    actorId: actor.id,
    companyId: team.companyId,
    summary: `Deleted team ${team.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
