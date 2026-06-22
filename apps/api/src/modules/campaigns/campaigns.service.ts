// Campaigns business logic: CRUD plus guarded status transitions
// (activate / pause / resume / complete / archive). Every state change writes
// an audit log entry.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
  canReassign,
  canWrite,
} from '../../utils/tenancy';
import type {
  ListCampaignsInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from './campaigns.schema';

export type { Actor };

export type CampaignAction = 'activate' | 'pause' | 'resume' | 'complete' | 'archive';

// Allowed source statuses for each transition action, and the resulting status.
const TRANSITIONS: Record<CampaignAction, { from: string[]; to: string }> = {
  activate: { from: ['draft', 'paused'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  complete: { from: ['active', 'paused'], to: 'completed' },
  archive: { from: ['draft', 'active', 'paused', 'completed'], to: 'archived' },
};

export async function listCampaigns(params: ListCampaignsInput, actor: Actor) {
  const { page, limit, search, status } = params;

  const where: Prisma.CampaignWhereInput = {
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    // Company isolation; team roles (sales_manager / sdr) see only their team.
    ...scopeWhere(actor, { team: true }),
  };

  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { sequences: true, enrollments: true } } },
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCampaignById(id: string, actor: Actor) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: { select: { sequences: true, enrollments: true, messages: true } },
    },
  });
  if (!campaign) throw Errors.notFound('Campaign not found');
  assertCanRead(actor, campaign, { team: true });
  return campaign;
}

export async function createCampaign(input: CreateCampaignInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create campaigns');
  const { icpRules, ...rest } = input;
  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      // Tenancy from the creator; the creator owns the campaign (reassignable).
      companyId: actor.companyId,
      teamId: actor.teamId,
      createdBy: actor.id,
      ownerUserId: actor.id,
      ...(icpRules !== undefined
        ? { icpRulesJson: icpRules as Prisma.InputJsonValue }
        : {}),
    },
  });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: campaign.id,
    action: 'campaign.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created campaign ${campaign.name}`,
    ipAddress: actor.ipAddress,
  });

  return campaign;
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
  actor: Actor,
) {
  const current = await getCampaignById(id, actor);
  assertCanWrite(actor, current, { team: true });

  // Once a campaign is completed or archived it is immutable except via status
  // transitions.
  if (current.status === 'completed' || current.status === 'archived') {
    throw Errors.conflict(`Cannot edit a ${current.status} campaign`);
  }

  const { icpRules, ...rest } = input;
  const data: Prisma.CampaignUpdateInput = { ...rest };
  if (icpRules !== undefined) {
    data.icpRulesJson = icpRules as Prisma.InputJsonValue;
  }

  const campaign = await prisma.campaign.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: campaign.id,
    action: 'campaign.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated campaign ${campaign.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return campaign;
}

export async function transitionCampaign(
  id: string,
  action: CampaignAction,
  actor: Actor,
) {
  const current = await getCampaignById(id, actor);
  assertCanWrite(actor, current, { team: true });
  const rule = TRANSITIONS[action];

  if (!rule.from.includes(current.status)) {
    throw Errors.conflict(
      `Cannot ${action} a campaign in status "${current.status}"`,
    );
  }

  const data: Prisma.CampaignUpdateInput = { status: rule.to };
  if (action === 'pause') {
    data.pausedAt = new Date();
    data.pauser = { connect: { id: actor.id } };
  } else if (action === 'resume' || action === 'activate') {
    data.pausedAt = null;
    data.pauser = { disconnect: true };
  } else if (action === 'complete') {
    data.completedAt = new Date();
  }

  const campaign = await prisma.campaign.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: campaign.id,
    action: `campaign.${action}`,
    actorType: 'user',
    actorId: actor.id,
    summary: `Campaign ${current.status} -> ${rule.to} (${action})`,
    payload: { from: current.status, to: rule.to },
    ipAddress: actor.ipAddress,
  });

  return campaign;
}

export async function deleteCampaign(id: string, actor: Actor) {
  const campaign = await getCampaignById(id, actor);
  assertCanWrite(actor, campaign, { team: true });

  // Only draft or archived campaigns can be hard-deleted; active ones must be
  // archived first to preserve history.
  if (campaign.status !== 'draft' && campaign.status !== 'archived') {
    throw Errors.conflict(
      'Only draft or archived campaigns can be deleted; archive it first',
    );
  }

  await prisma.campaign.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: id,
    action: 'campaign.delete',
    actorType: 'user',
    actorId: actor.id,
    summary: `Deleted campaign ${campaign.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}

// Reassign a campaign to a different owner within scope. super_admin reassigns
// anywhere in the company; sales_manager / sdr reassign within their own team.
// The target owner must be an active user in the same company (and same team for
// team-scoped actors).
export async function reassignCampaign(
  id: string,
  newOwnerUserId: string,
  actor: Actor,
) {
  if (!canReassign(actor.role)) {
    throw Errors.forbidden('Your role may not reassign campaigns');
  }

  // getCampaignById enforces the actor can see this campaign (team-scoped).
  const campaign = await getCampaignById(id, actor);

  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerUserId },
    select: { id: true, name: true, status: true, companyId: true, teamId: true },
  });
  if (!newOwner) throw Errors.badRequest('Target owner does not reference a user');
  if (newOwner.status !== 'active') {
    throw Errors.badRequest('Target owner is not an active user');
  }
  // Cross-tenant / cross-team assignment is forbidden.
  if (newOwner.companyId !== actor.companyId) {
    throw Errors.badRequest('Target owner is in a different company');
  }
  if (actor.role !== 'super_admin' && newOwner.teamId !== actor.teamId) {
    throw Errors.badRequest('You can only assign to members of your own team');
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { ownerUserId: newOwnerUserId },
  });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: id,
    action: 'campaign.reassign',
    actorType: 'user',
    actorId: actor.id,
    summary: `Reassigned campaign ${campaign.name} to ${newOwner.name}`,
    payload: { from: campaign.ownerUserId, to: newOwnerUserId },
    ipAddress: actor.ipAddress,
  });

  return updated;
}
