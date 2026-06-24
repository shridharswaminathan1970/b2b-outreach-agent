// Draft generator: takes a research brief + template/persona + the demand-gen
// framework constraints and returns a subject + body. Uses the active
// 'draft_generation' prompt; falls back to a deterministic draft in mock mode.
//
// A thin system wrapper enforces (a) a parseable "Subject:" format and (b) the
// demand-generation guardrail — touches with intent "ops_intel" must carry zero
// sales intent and reference the vendor only in the signature.
//
// The vendor/product is never hardcoded: it comes from the per-company
// ProductContext, falling back to a neutral generic context.
import { callClaude } from '../client';
import { getActivePrompt, renderPrompt } from '../registry';
import { metaFrom, GENERIC_PRODUCT, type AiResult, type ProductContext } from '../types';

export type TouchIntent = 'ops_intel' | 'soft_positioning';
export type TouchBranding = 'signature_only' | 'inline';
// The role of a touch within a Campaign-Brief sequence.
export type TouchType = 'trust_builder' | 'value_add' | 'intel_gathering' | 'cta';
export type CtaType = 'webinar' | 'demo' | 'case_study' | 'free_trial';

// Structured Product Brief context (the four U's + positioning). Drives the
// strategic framing of every email in the campaign.
export interface CampaignBriefContext {
  productPurpose?: string | null;
  targetCustomer?: string | null;
  u1Unworkable?: string | null;
  u2Urgent?: string | null;
  u3Unavoidable?: string | null;
  u4Underserved?: string | null;
  positioningStatement?: string | null;
}

// Buyer-persona context used to tune tone/relevance.
export interface BuyerPersonaContext {
  industry?: string | null;
  companySize?: string | null;
  seniority?: string | null;
  designation?: string | null;
}

// A CTA touch's offer: type + the type-specific fields the user filled in.
export interface CtaContext {
  type: CtaType;
  config?: Record<string, unknown> | null;
}

export interface DraftInput {
  contactName: string;
  company?: string | null;
  title?: string | null;
  painPoints?: string | null;
  persona?: string | null;
  researchBrief?: string | null;
  // Demand-gen framework constraints for this touch (default = ops-intel only).
  intent?: TouchIntent;
  branding?: TouchBranding;
  // Campaign-Brief sequence-strategy context for this touch.
  touchType?: TouchType;
  brief?: CampaignBriefContext | null;
  buyerPersona?: BuyerPersonaContext | null;
  cta?: CtaContext | null;
  // The selling company's product/market context (drives all copy). Optional —
  // falls back to a neutral generic context.
  product?: ProductContext | null;
  // Tenant whose prompt override (if any) should be used.
  companyId?: string | null;
}

export type DraftResult = AiResult<{ subject: string; body: string }>;

function frameworkInstruction(
  intent: TouchIntent,
  branding: TouchBranding,
  product: ProductContext,
): string {
  const lines = [
    'Format: the FIRST line must be "Subject: <one-line subject>", then a blank line, then the email body.',
    `You are writing on behalf of ${product.vendorName}, which offers ${product.productName} (${product.category}): ${product.valueProp}. Target market: ${product.market}.`,
  ];
  if (intent === 'ops_intel') {
    lines.push(
      'This is an early-sequence touch: deliver operational intelligence only. Do NOT pitch, sell, or ask for a meeting. No product claims in the subject or body.',
    );
  } else {
    lines.push(
      'This touch may include soft positioning: a light, relevant mention of how the approach helps is acceptable, but stay helpful, not salesy.',
    );
  }
  if (branding === 'signature_only') {
    lines.push(
      `Mention ${product.vendorName} / ${product.productName} ONLY in the email signature, never in the body.`,
    );
  }
  return lines.join(' ');
}

// Pull a string field from a CTA config blob (tolerant of unknown shapes).
function cfg(config: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!config) return '';
  for (const k of keys) {
    const v = config[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// Human-readable one-liner describing the CTA offer, used both as model guidance
// and (in mock mode) directly in the email body.
export function ctaSummary(cta: CtaContext | null | undefined): string {
  if (!cta) return 'invite the reader to a short, no-pressure conversation';
  const c = cta.config;
  switch (cta.type) {
    case 'webinar': {
      const title = cfg(c, 'webinar_title', 'title') || 'an upcoming webinar';
      const date = cfg(c, 'webinar_date', 'date');
      const link = cfg(c, 'registration_link', 'link');
      return `invite the reader to the webinar "${title}"${date ? ` on ${date}` : ''}${link ? ` (register: ${link})` : ''}`;
    }
    case 'demo': {
      const type = cfg(c, 'meeting_type', 'type') || 'demo';
      const dur = cfg(c, 'duration');
      const link = cfg(c, 'booking_link', 'link');
      return `offer a${dur ? ` ${dur}` : ''} ${type}${link ? ` (book: ${link})` : ''}`;
    }
    case 'case_study': {
      const title = cfg(c, 'asset_title', 'title') || 'a relevant case study';
      const url = cfg(c, 'asset_url', 'url');
      const outcome = cfg(c, 'outcome', 'result');
      return `share "${title}"${outcome ? ` (${outcome})` : ''}${url ? ` — ${url}` : ''}`;
    }
    case 'free_trial': {
      const offer = cfg(c, 'offer_name', 'name') || 'a free trial';
      const len = cfg(c, 'trial_length', 'length');
      const link = cfg(c, 'signup_link', 'link');
      return `offer ${offer}${len ? ` (${len})` : ''}${link ? ` — start: ${link}` : ''}`;
    }
    default:
      return 'invite the reader to a short, no-pressure conversation';
  }
}

// Per-touch guidance derived from the Campaign Brief's sequence strategy.
function touchGuidance(touchType: TouchType | undefined, cta: CtaContext | null | undefined): string {
  switch (touchType) {
    case 'value_add':
      return 'Touch role: VALUE-ADD. Give the reader something concretely useful (a tip, benchmark, or resource). No ask.';
    case 'intel_gathering':
      return 'Touch role: INTEL-GATHERING. Ask exactly one light, low-friction question to learn about their situation. Be curious, not salesy.';
    case 'cta':
      return `Touch role: CALL-TO-ACTION. This is the ask. Naturally and confidently ${ctaSummary(cta)}. One clear CTA only.`;
    case 'trust_builder':
    default:
      return 'Touch role: TRUST-BUILDER. Lead with a genuinely useful insight or perspective; build credibility. No ask.';
  }
}

// Compact strategic grounding from the Product Brief (the four U's + positioning).
function briefBlock(brief: CampaignBriefContext | null | undefined): string {
  if (!brief) return '';
  const rows: string[] = [];
  const add = (label: string, v?: string | null) => {
    if (v && v.trim()) rows.push(`- ${label}: ${v.trim()}`);
  };
  add('What it does', brief.productPurpose);
  add('Who it is for', brief.targetCustomer);
  add('What is broken without it (Unworkable)', brief.u1Unworkable);
  add('Why it must be solved now (Urgent)', brief.u2Urgent);
  add('Why they cannot ignore it (Unavoidable)', brief.u3Unavoidable);
  add('Why current solutions fail them (Underserved)', brief.u4Underserved);
  add('Positioning (what makes this inevitable)', brief.positioningStatement);
  if (!rows.length) return '';
  return `\nCampaign brief (strategic grounding — weave in naturally, never dump verbatim):\n${rows.join('\n')}`;
}

function personaBlock(p: BuyerPersonaContext | null | undefined): string {
  if (!p) return '';
  const bits: string[] = [];
  if (p.industry) bits.push(`industry: ${p.industry}`);
  if (p.companySize) bits.push(`company size: ${p.companySize}`);
  if (p.seniority) bits.push(`seniority: ${p.seniority}`);
  if (p.designation) bits.push(`role: ${p.designation}`);
  if (!bits.length) return '';
  return `\nRecipient persona (${bits.join(', ')}). Match tone and altitude to this reader.`;
}

// Parse "Subject: ..." + body out of a model response.
function parseDraft(text: string, fallbackName: string): { subject: string; body: string } {
  const match = text.match(/^\s*subject:\s*(.+)$/im);
  if (match) {
    const subject = match[1].trim();
    const body = text.slice(text.indexOf(match[0]) + match[0].length).replace(/^\s+/, '');
    return { subject, body: body.trim() || text.trim() };
  }
  return { subject: `A quick idea for ${fallbackName}`, body: text.trim() };
}

function mockDraft(input: DraftInput, product: ProductContext): string {
  const first = input.contactName.split(' ')[0] || input.contactName;
  const company = input.company || 'your team';
  const pain =
    input.brief?.u1Unworkable?.trim() ||
    input.painPoints?.trim() ||
    `the problem of ${product.valueProp.toLowerCase()}`;

  // CTA touch: lead to the configured ask.
  if (input.touchType === 'cta') {
    return [
      `Subject: A quick next step for ${company}`,
      '',
      `Hi ${first},`,
      '',
      `Over the last few notes I've shared a bit on ${pain}. If it's useful, I'd love to ${ctaSummary(input.cta)}.`,
      '',
      input.brief?.positioningStatement?.trim()
        ? input.brief.positioningStatement.trim()
        : 'No pressure either way — just say the word.',
      '',
      'Best,',
      `The ${product.vendorName} Team`,
      `(${product.productName})`,
    ].join('\n');
  }

  const role =
    input.touchType === 'intel_gathering'
      ? `\n\nQuick question: how is ${company} handling ${pain} today?`
      : input.touchType === 'value_add'
        ? `\n\nSharing a quick benchmark in case it helps your team.`
        : '';
  const soft =
    input.intent === 'soft_positioning'
      ? `\n\nTeams that tackle this early tend to move noticeably faster — happy to share how others in ${product.market} have approached it.`
      : '';
  return [
    `Subject: An idea on a common bottleneck for ${company}`,
    '',
    `Hi ${first},`,
    '',
    `Quick note for ${input.title || 'your team'} at ${company}: most teams we talk to in ${product.market} lose real time to ${pain}. A few have started addressing it differently and seen turnaround improve sharply.${role}${soft}`,
    '',
    'Sharing in case it is useful — no ask.',
    '',
    'Best,',
    `The ${product.vendorName} Team`,
    `(${product.productName})`,
  ].join('\n');
}

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const intent: TouchIntent = input.intent ?? 'ops_intel';
  const branding: TouchBranding = input.branding ?? 'signature_only';
  const product: ProductContext = input.product ?? GENERIC_PRODUCT;
  const prompt = await getActivePrompt('draft_generation', input.companyId);

  const rendered = prompt
    ? renderPrompt(prompt.promptText, {
        contact_name: input.contactName,
        company: input.company ?? '',
        title: input.title ?? '',
        pain_points: input.painPoints ?? '',
        product_name: product.productName,
        vendor_name: product.vendorName,
        value_prop: product.valueProp,
        market: product.market,
        icp: product.icp,
        // Campaign Brief render vars (available to DB prompt templates).
        product_purpose: input.brief?.productPurpose ?? '',
        target_customer: input.brief?.targetCustomer ?? '',
        u1_unworkable: input.brief?.u1Unworkable ?? '',
        u2_urgent: input.brief?.u2Urgent ?? '',
        u3_unavoidable: input.brief?.u3Unavoidable ?? '',
        u4_underserved: input.brief?.u4Underserved ?? '',
        positioning_statement: input.brief?.positioningStatement ?? '',
        touch_type: input.touchType ?? 'trust_builder',
        cta_summary: input.touchType === 'cta' ? ctaSummary(input.cta) : '',
      })
    : mockDraft(input, product);

  // Append brief + persona + CTA + research context to the registry prompt body.
  const contextParts = [rendered];
  const brief = briefBlock(input.brief);
  if (brief) contextParts.push(brief);
  const persona = personaBlock(input.buyerPersona);
  if (persona) contextParts.push(persona);
  if (input.researchBrief) contextParts.push(`\nResearch brief:\n${input.researchBrief}`);
  if (input.persona) contextParts.push(`\nPersona/voice: ${input.persona}`);
  const userContent = contextParts.join('\n');

  const system = `${frameworkInstruction(intent, branding, product)} ${touchGuidance(input.touchType, input.cta)}`;

  const result = await callClaude({
    purpose: 'draft_generation',
    model: prompt?.modelName ?? 'claude-sonnet-4-6',
    maxTokens: prompt?.maxTokens ?? 1500,
    temperature: prompt?.temperature ?? 0.7,
    system,
    userContent,
    promptVersionId: prompt?.id ?? null,
    mock: () => mockDraft(input, product),
  });

  if (!result.ok) return { ok: false, error: result.error };
  const { subject, body } = parseDraft(result.text, input.contactName.split(' ')[0] || 'you');
  return { ok: true, subject, body, meta: metaFrom(result, prompt?.id ?? null) };
}
