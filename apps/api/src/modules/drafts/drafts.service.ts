// Drafts business logic: generate (into the approval queue), edit, approve, and
// reject. Per CLAUDE.md every draft is queued for human approval — never
// auto-sent.
//
// Generation runs the Phase-3 AI pipeline in packages/ai: research brief →
// draft generator (with the touch's demand-gen intent/branding) → quality
// evaluator. The AI client falls back to deterministic mock output when no live
// ANTHROPIC_API_KEY is set, so this works offline. If the AI draft step errors,
// we fall back to the template renderer so a draft is always produced.
import { Prisma } from '@outreach/db';
import {
  generateResearchBrief,
  generateDraft as aiGenerateDraft,
  evaluateDraft,
  type TouchIntent,
  type TouchBranding,
} from '@outreach/ai';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { renderTemplate } from '../templates/templates.render';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
} from '../../utils/tenancy';
import type { GenerateDraftInput, ListDraftsInput, UpdateDraftInput } from './drafts.schema';

export type { Actor };

// where-fragment restricting drafts to those whose campaign is in the actor's
// tenant + team scope.
function draftScope(actor: Actor): Prisma.DraftWhereInput {
  return { campaign: scopeWhere(actor, { team: true }) };
}

type ContactWithAccount = Prisma.ContactGetPayload<{ include: { account: true } }>;

// Flatten a contact (+ account) into the variable map a template expects.
function contactVariables(contact: ContactWithAccount): Record<string, string> {
  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    name: contact.name ?? '',
    email: contact.email ?? '',
    title: contact.title ?? '',
    company: contact.account?.name ?? '',
    companyDomain: contact.account?.domain ?? '',
  };
}

async function buildDraftContent(
  input: GenerateDraftInput,
): Promise<{ subject: string | null; body: string | null }> {
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    include: { account: true },
  });
  if (!contact) throw Errors.badRequest('contactId does not reference a contact');

  // Resolve the template: explicit templateId wins, else the sequence step's.
  let templateId = input.templateId;
  if (!templateId && input.sequenceStepId) {
    const step = await prisma.sequenceStep.findUnique({
      where: { id: input.sequenceStepId },
      select: { templateId: true },
    });
    templateId = step?.templateId ?? undefined;
  }

  if (!templateId) {
    // No template available — produce a minimal placeholder draft.
    const name = contact.firstName || contact.name || 'there';
    return {
      subject: `Quick note for ${name}`,
      body: `Hi ${name},\n\n[Draft body pending — no template supplied]`,
    };
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw Errors.badRequest('templateId does not reference a template');

  const vars = contactVariables(contact);
  return {
    subject: renderTemplate(template.subjectTemplate, vars).output || null,
    body: renderTemplate(template.bodyTemplate, vars).output || null,
  };
}

export async function generateDraft(input: GenerateDraftInput, actor: Actor) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, companyId: true, teamId: true, persona: true },
  });
  if (!campaign) throw Errors.badRequest('campaignId does not reference a campaign');
  // Generating a draft is a write — gated to writers within scope.
  assertCanWrite(actor, campaign, { team: true });

  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    include: { account: { select: { name: true } } },
  });
  if (!contact) throw Errors.badRequest('contactId does not reference a contact');

  // Demand-gen framework constraints come from the sequence step (touches 1-5 =
  // ops_intel / signature_only). Default to the strictest setting when unknown.
  let intent: TouchIntent = 'ops_intel';
  let branding: TouchBranding = 'signature_only';
  if (input.sequenceStepId) {
    const step = await prisma.sequenceStep.findUnique({
      where: { id: input.sequenceStepId },
      select: { intent: true, branding: true },
    });
    if (step) {
      intent = step.intent as TouchIntent;
      branding = step.branding as TouchBranding;
    }
  }

  const md = (contact.metadataJson ?? null) as { painPoints?: string } | null;
  const aiBase = {
    contactName: contact.name,
    company: contact.account?.name ?? null,
    title: contact.title,
    painPoints: md?.painPoints ?? null,
    // Tenant whose prompt override (if any) the AI layer should use.
    companyId: campaign.companyId,
  };

  let tokens = 0;
  let latencyMs = 0;
  const accrue = (m: { totalTokens: number; latencyMs: number }) => {
    tokens += m.totalTokens;
    latencyMs += m.latencyMs;
  };

  // 1) Research brief (best-effort — a failure just means no brief context).
  const research = await generateResearchBrief(aiBase);
  const researchBrief = research.ok ? research.brief : null;
  if (research.ok) accrue(research.meta);

  // 2) Draft generation, with template-render fallback on AI failure.
  let subject: string | null;
  let body: string | null;
  let promptVersionId: string | null = null;
  const draftRes = await aiGenerateDraft({ ...aiBase, persona: campaign.persona, researchBrief, intent, branding });
  if (draftRes.ok) {
    subject = draftRes.subject;
    body = draftRes.body;
    promptVersionId = draftRes.meta.promptVersionId;
    accrue(draftRes.meta);
  } else {
    const fallback = await buildDraftContent(input);
    subject = fallback.subject;
    body = fallback.body;
  }

  // 3) Quality evaluation (best-effort).
  let qualityScore: number | null = null;
  let personalizationScore: number | null = null;
  const evalRes = await evaluateDraft({
    contactName: contact.name,
    company: contact.account?.name ?? null,
    subject: subject ?? '',
    body: body ?? '',
    companyId: campaign.companyId,
  });
  if (evalRes.ok) {
    qualityScore = evalRes.qualityScore;
    personalizationScore = evalRes.personalizationScore;
    accrue(evalRes.meta);
  }

  const draft = await prisma.draft.create({
    data: {
      contactId: input.contactId,
      campaignId: input.campaignId,
      sequenceStepId: input.sequenceStepId,
      status: 'pending_review',
      subject,
      body,
      researchBrief,
      promptVersionId,
      qualityScore: qualityScore != null ? new Prisma.Decimal(qualityScore) : null,
      personalizationScore:
        personalizationScore != null ? new Prisma.Decimal(personalizationScore) : null,
      aiTokensUsed: tokens > 0 ? tokens : null,
      aiLatencyMs: latencyMs > 0 ? latencyMs : null,
    },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    entityType: 'draft',
    entityId: draft.id,
    action: 'draft.generate',
    actorType: 'user',
    actorId: actor.id,
    summary: `Generated draft for contact ${draft.contactId} (queued for review)`,
    payload: { promptVersionId, qualityScore, personalizationScore, aiTokensUsed: tokens },
    ipAddress: actor.ipAddress,
  });

  return draft;
}

export async function listDrafts(params: ListDraftsInput, actor: Actor) {
  const { page, limit, status, campaignId, contactId } = params;

  const where: Prisma.DraftWhereInput = {
    ...(status ? { status } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(contactId ? { contactId } : {}),
    ...draftScope(actor),
  };

  const [items, total] = await Promise.all([
    prisma.draft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { contact: { select: { id: true, name: true, email: true } } },
    }),
    prisma.draft.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDraftById(id: string, actor: Actor) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      campaign: { select: { companyId: true, teamId: true } },
    },
  });
  if (!draft) throw Errors.notFound('Draft not found');
  assertCanRead(actor, draft.campaign, { team: true });
  return draft;
}

export async function updateDraft(id: string, input: UpdateDraftInput, actor: Actor) {
  const current = await getDraftById(id, actor);
  assertCanWrite(actor, current.campaign, { team: true });
  if (current.status !== 'pending_review') {
    throw Errors.conflict(`Only pending_review drafts can be edited (is ${current.status})`);
  }

  const draft = await prisma.draft.update({
    where: { id },
    data: { ...input },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    entityType: 'draft',
    entityId: id,
    action: 'draft.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Edited draft ${id}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return draft;
}

export async function approveDraft(id: string, actor: Actor) {
  const current = await getDraftById(id, actor);
  assertCanWrite(actor, current.campaign, { team: true });
  if (current.status !== 'pending_review') {
    throw Errors.conflict(`Only pending_review drafts can be approved (is ${current.status})`);
  }

  const draft = await prisma.draft.update({
    where: { id },
    data: { status: 'approved', reviewedBy: actor.id, reviewedAt: new Date() },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    entityType: 'draft',
    entityId: id,
    action: 'draft.approve',
    actorType: 'user',
    actorId: actor.id,
    summary: `Approved draft ${id}`,
    ipAddress: actor.ipAddress,
  });

  return draft;
}

export async function rejectDraft(id: string, reason: string, actor: Actor) {
  const current = await getDraftById(id, actor);
  assertCanWrite(actor, current.campaign, { team: true });
  if (current.status !== 'pending_review') {
    throw Errors.conflict(`Only pending_review drafts can be rejected (is ${current.status})`);
  }

  const draft = await prisma.draft.update({
    where: { id },
    data: {
      status: 'rejected',
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    entityType: 'draft',
    entityId: id,
    action: 'draft.reject',
    actorType: 'user',
    actorId: actor.id,
    summary: `Rejected draft ${id}: ${reason}`,
    payload: { reason },
    ipAddress: actor.ipAddress,
  });

  return draft;
}
