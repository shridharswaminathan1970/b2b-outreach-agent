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
  const soft =
    input.intent === 'soft_positioning'
      ? `\n\nTeams that tackle this early tend to move noticeably faster — happy to share how others in ${product.market} have approached it.`
      : '';
  return [
    `Subject: An idea on a common bottleneck for ${company}`,
    '',
    `Hi ${first},`,
    '',
    `Quick note for ${input.title || 'your team'} at ${company}: most teams we talk to in ${product.market} lose real time to the problem of ${product.valueProp.toLowerCase()}. A few have started addressing it differently and seen turnaround improve sharply.${soft}`,
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
      })
    : mockDraft(input, product);

  // Append research brief + persona context to the registry prompt body.
  const contextParts = [rendered];
  if (input.researchBrief) contextParts.push(`\nResearch brief:\n${input.researchBrief}`);
  if (input.persona) contextParts.push(`\nPersona/voice: ${input.persona}`);
  const userContent = contextParts.join('\n');

  const result = await callClaude({
    purpose: 'draft_generation',
    model: prompt?.modelName ?? 'claude-sonnet-4-6',
    maxTokens: prompt?.maxTokens ?? 1500,
    temperature: prompt?.temperature ?? 0.7,
    system: frameworkInstruction(intent, branding, product),
    userContent,
    promptVersionId: prompt?.id ?? null,
    mock: () => mockDraft(input, product),
  });

  if (!result.ok) return { ok: false, error: result.error };
  const { subject, body } = parseDraft(result.text, input.contactName.split(' ')[0] || 'you');
  return { ok: true, subject, body, meta: metaFrom(result, prompt?.id ?? null) };
}
