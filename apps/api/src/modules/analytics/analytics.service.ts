// Analytics business logic: aggregate campaign metrics, reply rates, and a
// pipeline proxy. Read-only — no audit log writes (these endpoints never mutate
// state). NOTE: the schema has no deal/amount field, so "pipeline" is reported
// as a proxy: interested replies + meetings booked. Swap for real deal values if
// a CRM amount is synced later.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { type Actor, scopeWhere, assertCanRead } from '../../utils/tenancy';
import { getFramework, stagesFor, openStagesFor } from '../opportunities/frameworks';
import type { OverviewInput, CampaignMetricsInput, PipelineInput } from './analytics.schema';

interface TimeWindow {
  from?: Date;
  to?: Date;
}

// A created_at / sentAt / receivedAt range filter, or undefined for all-time.
function dateFilter(w: TimeWindow): Prisma.DateTimeFilter | undefined {
  if (!w.from && !w.to) return undefined;
  return { ...(w.from ? { gte: w.from } : {}), ...(w.to ? { lt: w.to } : {}) };
}

// replies / sent as a percentage, rounded to one decimal. Guards divide-by-zero.
function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  replies: number;
  replyRate: number; // percentage
  meetingsBooked: number;
  interested: number;
  pipeline: number; // proxy: interested + meetingsBooked
}

// Core metric computation reused by overview (campaignId omitted = global) and
// the per-campaign breakdown. For an sdr, every underlying query is additionally
// restricted to campaigns they own.
async function computeMetrics(
  window: TimeWindow,
  actor: Actor,
  campaignId?: string,
): Promise<CampaignMetrics> {
  const sentAt = dateFilter(window);
  const receivedAt = dateFilter(window);
  const createdAt = dateFilter(window);

  // Tenant + team scope applied to each entity via its campaign relation.
  const campaignScope = scopeWhere(actor, { team: true });

  const messageWhere: Prisma.MessageWhereInput = {
    direction: 'outbound',
    ...(campaignId ? { campaignId } : {}),
    campaign: campaignScope,
  };
  // Replies reach a campaign through their originating message.
  const replyWhere: Prisma.ReplyWhereInput = {
    message: { ...(campaignId ? { campaignId } : {}), campaign: campaignScope },
  };
  const taskWhere: Prisma.TaskWhereInput = {
    taskType: 'book_meeting',
    ...(campaignId ? { campaignId } : {}),
    campaign: campaignScope,
  };

  const [sent, delivered, opened, bounced, replies, interested, meetingsBooked] =
    await Promise.all([
      prisma.message.count({
        where: { ...messageWhere, sentAt: sentAt ? sentAt : { not: null } },
      }),
      prisma.message.count({
        where: { ...messageWhere, status: 'delivered', ...(sentAt ? { sentAt } : {}) },
      }),
      prisma.message.count({
        where: { ...messageWhere, openedAt: { not: null }, ...(sentAt ? { sentAt } : {}) },
      }),
      prisma.message.count({
        where: { ...messageWhere, status: 'bounced', ...(sentAt ? { sentAt } : {}) },
      }),
      prisma.reply.count({
        where: { ...replyWhere, ...(receivedAt ? { receivedAt } : {}) },
      }),
      prisma.reply.count({
        where: { ...replyWhere, classification: 'interested', ...(receivedAt ? { receivedAt } : {}) },
      }),
      prisma.task.count({
        where: { ...taskWhere, ...(createdAt ? { createdAt } : {}) },
      }),
    ]);

  return {
    sent,
    delivered,
    opened,
    bounced,
    replies,
    replyRate: rate(replies, sent),
    meetingsBooked,
    interested,
    pipeline: interested + meetingsBooked,
  };
}

// Dashboard overview: windowed outreach metrics plus current-state counts
// (campaign/contact totals are point-in-time, not windowed).
export async function getOverview(params: OverviewInput, actor: Actor) {
  // Counts are scoped to the actor: an sdr sees only their own campaigns/contacts.
  const campaignScope = scopeWhere(actor, { team: true });
  const contactScope = scopeWhere(actor, { team: true });

  const [metrics, totalCampaigns, activeCampaigns, totalContacts, suppressedContacts] =
    await Promise.all([
      computeMetrics(params, actor),
      prisma.campaign.count({ where: { ...campaignScope } }),
      prisma.campaign.count({ where: { status: 'active', ...campaignScope } }),
      prisma.contact.count({ where: { ...contactScope } }),
      prisma.contact.count({ where: { suppressed: true, ...contactScope } }),
    ]);

  return {
    window: { from: params.from ?? null, to: params.to ?? null },
    campaigns: { total: totalCampaigns, active: activeCampaigns },
    contacts: { total: totalContacts, suppressed: suppressedContacts },
    outreach: metrics,
  };
}

// Per-campaign metric breakdown (one row per campaign).
export async function getCampaignMetrics(params: CampaignMetricsInput, actor: Actor) {
  const { limit, ...window } = params;

  const campaigns = await prisma.campaign.findMany({
    where: { ...scopeWhere(actor, { team: true }) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, name: true, status: true, createdAt: true },
  });

  const rows = await Promise.all(
    campaigns.map(async (c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      metrics: await computeMetrics(window, actor, c.id),
    })),
  );

  return rows;
}

// Single campaign deep-dive: metrics plus a reply classification breakdown.
export async function getCampaignDetail(
  campaignId: string,
  window: TimeWindow,
  actor: Actor,
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true, createdAt: true, companyId: true, teamId: true },
  });
  if (!campaign) throw Errors.notFound('Campaign not found');
  assertCanRead(actor, campaign, { team: true });

  const receivedAt = dateFilter(window);
  const [metrics, enrolled, byClassification] = await Promise.all([
    computeMetrics(window, actor, campaignId),
    prisma.campaignEnrollment.count({ where: { campaignId } }),
    prisma.reply.groupBy({
      by: ['classification'],
      where: { message: { campaignId }, ...(receivedAt ? { receivedAt } : {}) },
      _count: { _all: true },
    }),
  ]);

  const replyBreakdown = byClassification.reduce<Record<string, number>>((acc, r) => {
    acc[r.classification ?? 'unclassified'] = r._count._all;
    return acc;
  }, {});

  return {
    campaign,
    enrolled,
    metrics,
    replyBreakdown,
  };
}

// ── Pipeline / forecast (opportunities) ─────────────────────────────────────

// Pipeline metrics scoped to the actor's tenant + team, optionally filtered by a
// salesperson and a created-at window. Reports open pipeline value, the weighted
// forecast (Σ amount × probability), closed-won value, win rate, and a per-stage
// breakdown — covering the MANAGEMENT_ADMIN pipeline/forecast/closed-won views.
export async function getPipeline(params: PipelineInput, actor: Actor) {
  const createdAt = dateFilter(params);
  const where: Prisma.OpportunityWhereInput = {
    ...scopeWhere(actor, { team: true }),
    ...(params.ownerUserId ? { ownerUserId: params.ownerUserId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  // Stage breakdown is reported against the company's own framework.
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { salesFramework: true },
  });
  const framework = getFramework(company?.salesFramework).id;
  const allStages = stagesFor(framework);
  const openStages: readonly string[] = openStagesFor(framework);

  const grouped = await prisma.opportunity.groupBy({
    by: ['stage'],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });

  const byStage = allStages.map((stage) => {
    const g = grouped.find((x) => x.stage === stage);
    return { stage, count: g?._count._all ?? 0, value: Number(g?._sum.amount ?? 0) };
  });

  const openRows = byStage.filter((s) => openStages.includes(s.stage));
  const open = openRows.reduce(
    (acc, s) => ({ count: acc.count + s.count, value: acc.value + s.value }),
    { count: 0, value: 0 },
  );
  const won = byStage.find((s) => s.stage === 'closed_won') ?? { count: 0, value: 0 };
  const lost = byStage.find((s) => s.stage === 'closed_lost') ?? { count: 0, value: 0 };

  // Weighted forecast = Σ (amount × probability) over open opportunities.
  const openOpps = await prisma.opportunity.findMany({
    where: { ...where, stage: { in: [...openStages] } },
    select: { amount: true, probability: true },
  });
  const weightedForecast = openOpps.reduce(
    (acc, o) => acc + Number(o.amount ?? 0) * (o.probability / 100),
    0,
  );

  const decided = won.count + lost.count;
  const winRate = decided > 0 ? Math.round((won.count / decided) * 1000) / 10 : 0;

  return {
    window: { from: params.from ?? null, to: params.to ?? null },
    open: { count: open.count, value: Math.round(open.value * 100) / 100 },
    weightedForecast: Math.round(weightedForecast * 100) / 100,
    won: { count: won.count, value: Math.round(won.value * 100) / 100 },
    lost: { count: lost.count },
    winRate, // percentage
    byStage,
  };
}
