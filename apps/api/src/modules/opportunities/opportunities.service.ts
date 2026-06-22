// Opportunities (pipeline) business logic. Tenant- + team-scoped exactly like
// leads (contacts): super_admin/management_admin see the whole company, team
// roles see their team. Writes require a writer role; reassignment uses the
// reassign capability (sdr may reassign within their team).
//
// Stages, probabilities, and qualification gates are framework-dependent
// (Company.salesFramework): the "general" framework keeps the classic ungated
// pipeline; "ignite_apex" enforces the IGNITE-APEX Sales OS gates + verdict.
import { Prisma, prisma } from '@outreach/db';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
  canWrite,
  canReassign,
} from '../../utils/tenancy';
import {
  isClosedStageFor,
  isValidStageFor,
  stageProbabilityFor,
  stagesFor,
  openStagesFor,
  closedStagesFor,
  getFramework,
  type SalesFramework,
} from './frameworks';
import { recommendNextAction, productContextFrom } from '@outreach/ai';
import { buildDealReport } from './report';
import { recommendFor, priorityRank } from './nextAction';
import {
  parseQualification,
  qualificationSchema,
  computeVerdict,
  scoreQualification,
  cementScore,
  evaluateStageAdvance,
  VERDICT_PROBABILITY,
  VERDICT_LABEL,
  type Qualification,
  type QualificationInput,
} from './qualification';
import type {
  ListOpportunitiesInput,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  ChangeStageInput,
} from './opportunities.schema';

const oppInclude = {
  contact: { select: { id: true, name: true, email: true } },
  account: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.OpportunityInclude;

// Roles permitted to override a failed ignite_apex stage gate.
const GATE_OVERRIDE_ROLES = ['super_admin', 'management_admin', 'sales_manager'];

// Resolve the company's sales framework (drives stages/gates/probability).
async function companyFramework(companyId: string): Promise<SalesFramework> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { salesFramework: true },
  });
  return getFramework(c?.salesFramework).id;
}

// Validate that a referenced contact/account/campaign is in the actor's company.
async function assertRefInCompany(
  kind: 'contact' | 'account' | 'campaign',
  id: string | null | undefined,
  actor: Actor,
): Promise<void> {
  if (!id) return;
  const row =
    kind === 'contact'
      ? await prisma.contact.findUnique({ where: { id }, select: { companyId: true } })
      : kind === 'account'
        ? await prisma.account.findUnique({ where: { id }, select: { companyId: true } })
        : await prisma.campaign.findUnique({ where: { id }, select: { companyId: true } });
  if (!row || row.companyId !== actor.companyId) {
    throw Errors.badRequest(`Referenced ${kind} is not in your company`);
  }
}

export async function listOpportunities(params: ListOpportunitiesInput, actor: Actor) {
  const { page, limit, search, stage, ownerUserId, open, verdict, from, to } = params;
  const framework = await companyFramework(actor.companyId);

  const createdAt =
    from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;

  const where: Prisma.OpportunityWhereInput = {
    ...scopeWhere(actor, { team: true }),
    ...(stage ? { stage } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(verdict ? { verdict } : {}),
    ...(open !== undefined
      ? { stage: { in: open ? openStagesFor(framework) : closedStagesFor(framework) } }
      : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: oppInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return {
    items,
    framework,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getOpportunityById(id: string, actor: Actor) {
  const opp = await prisma.opportunity.findUnique({ where: { id }, include: oppInclude });
  if (!opp) throw Errors.notFound('Opportunity not found');
  assertCanRead(actor, opp, { team: true });
  return opp;
}

export async function createOpportunity(input: CreateOpportunityInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create opportunities');

  const framework = await companyFramework(actor.companyId);
  const stage = input.stage ?? stagesFor(framework)[0];
  if (!isValidStageFor(framework, stage)) {
    throw Errors.badRequest(`Stage '${stage}' is not valid for the ${framework} framework`);
  }

  await assertRefInCompany('contact', input.contactId, actor);
  await assertRefInCompany('account', input.accountId, actor);
  await assertRefInCompany('campaign', input.campaignId, actor);

  const probability = input.probability ?? stageProbabilityFor(framework, stage);

  const opp = await prisma.opportunity.create({
    data: {
      companyId: actor.companyId,
      teamId: actor.teamId,
      ownerUserId: input.ownerUserId ?? actor.id,
      createdBy: actor.id,
      name: input.name,
      stage,
      amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
      currency: input.currency,
      probability,
      expectedCloseDate: input.expectedCloseDate ?? null,
      source: input.source ?? null,
      contactId: input.contactId ?? null,
      accountId: input.accountId ?? null,
      campaignId: input.campaignId ?? null,
      externalSource: input.externalSource ?? null,
      externalId: input.externalId ?? null,
      ...(isClosedStageFor(framework, stage) ? { closedAt: new Date() } : {}),
    },
    include: oppInclude,
  });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: opp.id,
    action: 'opportunity.create',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Created opportunity ${opp.name} (${opp.stage})`,
    payload: { stage: opp.stage, amount: input.amount, framework },
    ipAddress: actor.ipAddress,
  });

  return opp;
}

export async function updateOpportunity(
  id: string,
  input: UpdateOpportunityInput,
  actor: Actor,
) {
  const current = await getOpportunityById(id, actor);
  assertCanWrite(actor, current, { team: true });

  await assertRefInCompany('contact', input.contactId, actor);
  await assertRefInCompany('account', input.accountId, actor);
  await assertRefInCompany('campaign', input.campaignId, actor);

  const data: Prisma.OpportunityUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.probability !== undefined) data.probability = input.probability;
  if (input.expectedCloseDate !== undefined) data.expectedCloseDate = input.expectedCloseDate;
  if (input.source !== undefined) data.source = input.source;
  if (input.externalSource !== undefined) data.externalSource = input.externalSource;
  if (input.externalId !== undefined) data.externalId = input.externalId;
  if (input.amount !== undefined) {
    data.amount = input.amount != null ? new Prisma.Decimal(input.amount) : null;
  }
  if (input.contactId !== undefined) {
    data.contact = input.contactId ? { connect: { id: input.contactId } } : { disconnect: true };
  }
  if (input.accountId !== undefined) {
    data.account = input.accountId ? { connect: { id: input.accountId } } : { disconnect: true };
  }
  if (input.campaignId !== undefined) {
    data.campaign = input.campaignId ? { connect: { id: input.campaignId } } : { disconnect: true };
  }

  const opp = await prisma.opportunity.update({ where: { id }, data, include: oppInclude });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: 'opportunity.update',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Updated opportunity ${opp.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return opp;
}

// Move an opportunity to a new stage. For ignite_apex this enforces the
// qualification gates (unless a manager passes forceGate) and snaps the
// probability to the verdict-driven forecast. Closing sets closedAt/closeReason.
export async function changeStage(id: string, input: ChangeStageInput, actor: Actor) {
  const current = await getOpportunityById(id, actor);
  assertCanWrite(actor, current, { team: true });

  const framework = await companyFramework(actor.companyId);
  if (!isValidStageFor(framework, input.stage)) {
    throw Errors.badRequest(`Stage '${input.stage}' is not valid for the ${framework} framework`);
  }

  const q = parseQualification(current.qualificationJson);
  let overridden = false;

  if (framework === 'ignite_apex') {
    const gate = evaluateStageAdvance(framework, current.stage, input.stage, q);
    if (!gate.ok) {
      if (!input.forceGate) {
        throw Errors.badRequest(
          `Gate not met advancing to ${input.stage}. ${gate.reason ?? ''} Required: ${gate.requirement ?? ''}`.trim(),
        );
      }
      if (!GATE_OVERRIDE_ROLES.includes(actor.role)) {
        throw Errors.forbidden('Only a manager may override a qualification gate');
      }
      overridden = true;
    }
  }

  const closing = isClosedStageFor(framework, input.stage);
  const { verdict } = computeVerdict(q);

  // Probability: closed stages snap to their stage value (100/0); open
  // ignite_apex stages follow the verdict-driven forecast; general follows stage.
  let probability: number;
  if (closing) probability = stageProbabilityFor(framework, input.stage);
  else if (framework === 'ignite_apex') probability = VERDICT_PROBABILITY[verdict];
  else probability = stageProbabilityFor(framework, input.stage);

  const data: Prisma.OpportunityUpdateInput = {
    stage: input.stage,
    probability,
    closedAt: closing ? new Date() : null,
    closeReason: closing ? (input.closeReason ?? null) : null,
    ...(framework === 'ignite_apex' ? { verdict } : {}),
  };

  const opp = await prisma.opportunity.update({ where: { id }, data, include: oppInclude });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: overridden ? 'opportunity.stage_change_override' : 'opportunity.stage_change',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Opportunity ${current.stage} -> ${input.stage}${overridden ? ' (gate overridden)' : ''}`,
    payload: { from: current.stage, to: input.stage, closeReason: input.closeReason, overridden, verdict },
    ipAddress: actor.ipAddress,
  });

  return opp;
}

export async function reassignOpportunity(id: string, newOwnerUserId: string, actor: Actor) {
  if (!canReassign(actor.role)) {
    throw Errors.forbidden('Your role may not reassign opportunities');
  }
  const current = await getOpportunityById(id, actor);

  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerUserId },
    select: { id: true, name: true, status: true, companyId: true, teamId: true },
  });
  if (!newOwner) throw Errors.badRequest('Target owner does not reference a user');
  if (newOwner.status !== 'active') throw Errors.badRequest('Target owner is not active');
  if (newOwner.companyId !== actor.companyId) {
    throw Errors.badRequest('Target owner is in a different company');
  }
  if (actor.role !== 'super_admin' && newOwner.teamId !== actor.teamId) {
    throw Errors.badRequest('You can only assign to members of your own team');
  }

  const opp = await prisma.opportunity.update({
    where: { id },
    data: { ownerUserId: newOwnerUserId },
    include: oppInclude,
  });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: 'opportunity.reassign',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Reassigned opportunity ${current.name} to ${newOwner.name}`,
    payload: { from: current.ownerUserId, to: newOwnerUserId },
    ipAddress: actor.ipAddress,
  });

  return opp;
}

export async function deleteOpportunity(id: string, actor: Actor) {
  const opp = await getOpportunityById(id, actor);
  assertCanWrite(actor, opp, { team: true });

  await prisma.opportunity.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: 'opportunity.delete',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Deleted opportunity ${opp.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}

// ---------------------------------------------------------------------------
// IGNITE-APEX qualification — the deal workspace data
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Recursive merge: nested objects merge, arrays/primitives replace.
function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isPlainObject(v) && isPlainObject(cur) ? deepMerge(cur, v) : v;
  }
  return out;
}

// Per-stage gate status (for rendering the workspace progression).
function gateStatuses(framework: SalesFramework, current: string, q: Qualification) {
  return getFramework(framework).stages
    .filter((s) => s.open && s.id !== getFramework(framework).stages[0].id)
    .map((s) => {
      const g = evaluateStageAdvance(framework, current, s.id, q);
      return { stage: s.id, ok: g.ok, requirement: g.requirement, reason: g.reason };
    });
}

// Assemble the full workspace view for an opportunity.
function qualificationView(opp: { stage: string; qualificationJson: unknown }, framework: SalesFramework) {
  const q = parseQualification(opp.qualificationJson);
  const scores = scoreQualification(q);
  const { verdict } = computeVerdict(q);
  return {
    framework,
    stage: opp.stage,
    qualification: q,
    scores,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    cement: cementScore(q),
    gates: gateStatuses(framework, opp.stage, q),
  };
}

// Build the 9-section IGNITE-APEX deal briefing (report.ts). Read-scoped like any
// opportunity; the AI scripts section honours the company's product context.
export async function getDealReport(id: string, actor: Actor) {
  const opp = await getOpportunityById(id, actor);
  const framework = await companyFramework(actor.companyId);
  if (framework !== 'ignite_apex') {
    throw Errors.badRequest('The deal report applies only to the IGNITE-APEX framework');
  }
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { settingsJson: true },
  });
  const report = await buildDealReport(opp, company?.settingsJson ?? null);

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: 'opportunity.report_generated',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Generated deal briefing for ${opp.name}`,
    ipAddress: actor.ipAddress,
  });

  return { opportunity: opp, report };
}

// Days since an opportunity last changed (drives the recency overlay).
function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

// Single deal: deterministic next-best-action + an AI-generated script for it.
// Works for both frameworks.
export async function getOpportunityRecommendation(id: string, actor: Actor) {
  const opp = await getOpportunityById(id, actor);
  const framework = await companyFramework(actor.companyId);
  const qualification = framework === 'ignite_apex' ? parseQualification(opp.qualificationJson) : null;
  const daysSinceUpdate = daysSince(opp.updatedAt);

  const rec = recommendFor({
    framework,
    stage: opp.stage,
    verdict: opp.verdict,
    daysSinceUpdate,
    qualification,
  });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { settingsJson: true },
  });
  const ai = await recommendNextAction({
    entityName: opp.contact?.name ?? opp.name,
    company: opp.account?.name ?? null,
    framework,
    stage: opp.stage,
    verdict: opp.verdict,
    action: rec.action,
    rationale: rec.rationale,
    product: productContextFrom(company?.settingsJson ?? null),
    companyId: actor.companyId,
  });

  return {
    opportunityId: id,
    daysSinceUpdate,
    recommendation: { ...rec, script: ai.ok ? ai.script : null },
  };
}

// Dashboard list: the top open opportunities ranked by urgency, each with its
// deterministic next action (no AI call — cheap enough to render a list).
export async function listOpportunityRecommendations(actor: Actor, limit = 5) {
  const framework = await companyFramework(actor.companyId);
  const open = openStagesFor(framework);

  const rows = await prisma.opportunity.findMany({
    where: { ...scopeWhere(actor, { team: true }), stage: { in: open } },
    include: { contact: { select: { name: true } }, account: { select: { name: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 50, // gather a pool, then rank by priority below
  });

  const items = rows
    .map((o) => {
      const qualification = framework === 'ignite_apex' ? parseQualification(o.qualificationJson) : null;
      const daysSinceUpdate = daysSince(o.updatedAt);
      const recommendation = recommendFor({
        framework,
        stage: o.stage,
        verdict: o.verdict,
        daysSinceUpdate,
        qualification,
      });
      return {
        id: o.id,
        name: o.name,
        stage: o.stage,
        verdict: o.verdict,
        amount: o.amount != null ? Number(o.amount) : null,
        contact: o.contact?.name ?? null,
        account: o.account?.name ?? null,
        daysSinceUpdate,
        recommendation,
      };
    })
    .sort(
      (a, b) =>
        priorityRank(b.recommendation.priority) - priorityRank(a.recommendation.priority) ||
        (b.amount ?? 0) - (a.amount ?? 0),
    )
    .slice(0, limit);

  return { framework, items };
}

export async function getQualification(id: string, actor: Actor) {
  const opp = await getOpportunityById(id, actor);
  const framework = await companyFramework(actor.companyId);
  if (framework !== 'ignite_apex') {
    throw Errors.badRequest('Qualification applies only to the IGNITE-APEX framework');
  }
  return { opportunity: opp, ...qualificationView(opp, framework) };
}

export async function updateQualification(id: string, input: QualificationInput, actor: Actor) {
  const current = await getOpportunityById(id, actor);
  assertCanWrite(actor, current, { team: true });

  const framework = await companyFramework(actor.companyId);
  if (framework !== 'ignite_apex') {
    throw Errors.badRequest('Qualification applies only to the IGNITE-APEX framework');
  }

  const before = parseQualification(current.qualificationJson);
  const merged = qualificationSchema.parse(
    deepMerge(before as unknown as Record<string, unknown>, input as Record<string, unknown>),
  );
  const { verdict } = computeVerdict(merged);

  // Open deals: forecast follows the verdict. Closed deals keep their snap.
  const closing = isClosedStageFor(framework, current.stage);
  const probability = closing ? current.probability : VERDICT_PROBABILITY[verdict];

  const opp = await prisma.opportunity.update({
    where: { id },
    data: {
      qualificationJson: merged as unknown as Prisma.InputJsonValue,
      verdict,
      probability,
    },
    include: oppInclude,
  });

  await writeAuditLog({
    entityType: 'opportunity',
    entityId: id,
    action: 'opportunity.qualification_update',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Updated qualification for ${opp.name}: ${Object.keys(input).join(', ')} (verdict: ${verdict})`,
    payload: { sections: Object.keys(input), verdict },
    ipAddress: actor.ipAddress,
  });

  return { opportunity: opp, ...qualificationView(opp, framework) };
}
