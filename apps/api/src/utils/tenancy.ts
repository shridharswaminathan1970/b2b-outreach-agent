// Multi-tenant + role + hierarchy access control. This is the single source of
// truth for "who can see/do what" and replaces the old per-user ownership model.
//
// Two independent permission axes:
//   1. DATA permissions (by role): what records you can read/write.
//        super_admin       → read+write across the whole company
//        management_admin  → read-only across the whole company
//        sales_manager     → read+write within their own team
//        sdr               → read-only within their team (+ reassign within team)
//   2. USER-MANAGEMENT permissions (by hierarchy): you may promote/demote/transfer
//      only users in your subordinate subtree (your reports and theirs). The
//      super_admin sits atop every chain, so they manage everyone in the company.
import type { AuthUser, UserRole } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { Errors } from './response';

export interface Actor {
  id: string;
  role: UserRole;
  companyId: string;
  teamId: string | null;
  ipAddress?: string | null;
}

// Build the service-layer Actor from the authenticated request user.
export function toActor(user: AuthUser, ipAddress?: string | null): Actor {
  return {
    id: user.id,
    role: user.role,
    companyId: user.companyId,
    teamId: user.teamId,
    ipAddress: ipAddress ?? null,
  };
}

// The cross-company platform operator ("super duper admin"). Sits above every
// company: full read/write across ALL companies, teams, and users.
export function isPlatformOwner(role: UserRole): boolean {
  return role === 'platform_owner';
}

// Company-wide roles see all teams; team roles are restricted to their own team.
// platform_owner is even broader (cross-company) — handled in scopeWhere/assert*.
export function isCompanyWide(role: UserRole): boolean {
  return role === 'platform_owner' || role === 'super_admin' || role === 'management_admin';
}

// Roles permitted to create / edit / delete domain records.
export function canWrite(role: UserRole): boolean {
  return role === 'platform_owner' || role === 'super_admin' || role === 'sales_manager';
}

// Roles permitted to reassign leads / campaigns within their scope (sdr may
// reassign within their team even though they cannot otherwise write).
export function canReassign(role: UserRole): boolean {
  return (
    role === 'platform_owner' ||
    role === 'super_admin' ||
    role === 'sales_manager' ||
    role === 'sdr'
  );
}

// ── Read scoping ─────────────────────────────────────────────────────────────
// A Prisma where-fragment scoping a query to the actor's tenant (+ team when the
// table is team-scoped and the actor is a team role). Spread into a where:
//   const where = { ...filters, ...scopeWhere(actor, { team: true }) }
export function scopeWhere(
  actor: Actor,
  opts: { team?: boolean } = {},
): Record<string, string | null> {
  // platform_owner spans every company → no tenant filter at all.
  if (isPlatformOwner(actor.role)) return {};
  const where: Record<string, string | null> = { companyId: actor.companyId };
  if (opts.team && !isCompanyWide(actor.role)) {
    where.teamId = actor.teamId;
  }
  return where;
}

// Guard a single record read. Throws 404 (not 403) on a cross-tenant / cross-team
// miss so existence never leaks.
export function assertCanRead(
  actor: Actor,
  record: { companyId: string; teamId?: string | null },
  opts: { team?: boolean } = {},
): void {
  if (isPlatformOwner(actor.role)) return; // cross-company: anything is readable
  if (record.companyId !== actor.companyId) throw Errors.notFound('Not found');
  if (opts.team && !isCompanyWide(actor.role) && record.teamId !== actor.teamId) {
    throw Errors.notFound('Not found');
  }
}

// Guard a mutation: record must be readable AND the role must be a writer.
export function assertCanWrite(
  actor: Actor,
  record: { companyId: string; teamId?: string | null },
  opts: { team?: boolean } = {},
): void {
  assertCanRead(actor, record, opts);
  if (!canWrite(actor.role)) {
    throw Errors.forbidden('Your role does not permit this action');
  }
}

// ── Reporting hierarchy (user management) ────────────────────────────────────
// All user ids transitively reporting to the actor (their subordinate subtree).
// super_admin manages every other user in the company.
export async function getSubordinateIds(actor: Actor): Promise<string[]> {
  if (isPlatformOwner(actor.role)) {
    // Cross-company: manages every user everywhere (except self).
    const users = await prisma.user.findMany({
      where: { id: { not: actor.id } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (actor.role === 'super_admin') {
    const users = await prisma.user.findMany({
      where: { companyId: actor.companyId, id: { not: actor.id } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  // Recursive walk down the reports_to chain, scoped to the company.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM users
        WHERE reports_to_user_id = ${actor.id} AND company_id = ${actor.companyId}
      UNION ALL
      SELECT u.id FROM users u
        JOIN subtree s ON u.reports_to_user_id = s.id
        WHERE u.company_id = ${actor.companyId}
    )
    SELECT id FROM subtree;
  `;
  return rows.map((r) => r.id);
}

// The users a manager may SEE/manage: themselves plus their whole subordinate
// subtree. super_admin gets the entire company (incl. self for completeness).
export async function getManagedUserIds(actor: Actor): Promise<string[]> {
  return [actor.id, ...(await getSubordinateIds(actor))];
}

// Team ids inside the actor's scope: any team managed by the actor or by one of
// their subordinates, plus the actor's own team. Company-wide roles return null
// (= no team restriction). Used to bound user listing + transfers so a manager
// can never see into or move users between *other* managers' teams.
export async function getScopedTeamIds(actor: Actor): Promise<string[] | null> {
  if (isCompanyWide(actor.role)) return null;
  const managedUserIds = await getManagedUserIds(actor);
  const teams = await prisma.team.findMany({
    where: {
      companyId: actor.companyId,
      OR: [
        { managerUserId: { in: managedUserIds } },
        ...(actor.teamId ? [{ id: actor.teamId }] : []),
      ],
    },
    select: { id: true },
  });
  return teams.map((t) => t.id);
}

// May the actor promote/demote/transfer the target user? Only within their
// subordinate subtree (same company); never themselves.
export async function canManageUser(actor: Actor, targetUserId: string): Promise<boolean> {
  if (targetUserId === actor.id) return false;
  if (isPlatformOwner(actor.role)) {
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    return Boolean(target); // cross-company: may manage any user
  }
  if (actor.role === 'super_admin') {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { companyId: true },
    });
    return Boolean(target && target.companyId === actor.companyId);
  }
  const subordinates = await getSubordinateIds(actor);
  return subordinates.includes(targetUserId);
}

// Throwing variant for controllers/services.
export async function assertCanManageUser(actor: Actor, targetUserId: string): Promise<void> {
  if (!(await canManageUser(actor, targetUserId))) {
    throw Errors.forbidden('You may only manage users in your own reporting line');
  }
}
