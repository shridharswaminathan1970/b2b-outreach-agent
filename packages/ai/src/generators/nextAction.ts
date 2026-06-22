// Next-best-action recommender. The *decision* of what to do next is made
// deterministically by the API (cheap + reliable); this AI step turns that
// recommended action + deal context into a concrete, ready-to-use rep script.
// Works for any framework and falls back to a templated script in mock mode.
import { callClaude } from '../client';
import { metaFrom, GENERIC_PRODUCT, type AiResult, type ProductContext } from '../types';

export interface NextActionInput {
  entityName: string; // contact or deal name
  company?: string | null;
  framework: string; // 'general' | 'ignite_apex'
  stage: string;
  verdict?: string | null;
  action: string; // the recommended action title (decided by the API)
  rationale: string; // why this action
  product?: ProductContext | null;
  companyId?: string | null;
}

export type NextActionResult = AiResult<{ action: string; rationale: string; script: string }>;

function mockScript(input: NextActionInput, product: ProductContext): string {
  const first = input.entityName.split(' ')[0] || input.entityName;
  const at = input.company ? ` at ${input.company}` : '';
  return `Hi ${first}, following up on where things stand${at}. ${input.rationale} As a concrete next step: ${input.action.toLowerCase()}. Worth a short conversation so we can move this forward with ${product.productName}?`;
}

export async function recommendNextAction(input: NextActionInput): Promise<NextActionResult> {
  const product: ProductContext = input.product ?? GENERIC_PRODUCT;

  const userContent = [
    `Vendor: ${product.vendorName} — ${product.productName}: ${product.valueProp}.`,
    `Deal/contact: ${input.entityName}${input.company ? ` at ${input.company}` : ''}.`,
    `Sales framework: ${input.framework}. Stage: ${input.stage}.${input.verdict ? ` Verdict: ${input.verdict}.` : ''}`,
    `Recommended next action: ${input.action}.`,
    `Why: ${input.rationale}`,
    '',
    'Write a concise, specific script (3-5 sentences, email or call talking points) the rep can use to take exactly this next action. No fluff, no generic marketing language.',
  ].join('\n');

  const result = await callClaude({
    purpose: 'next_action',
    model: 'claude-sonnet-4-6',
    maxTokens: 600,
    temperature: 0.5,
    system:
      'You are a pragmatic sales coach. Given a recommended next action and deal context, produce one short, usable script for that action. Output the script text only.',
    userContent,
    promptVersionId: null,
    mock: () => mockScript(input, product),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    action: input.action,
    rationale: input.rationale,
    script: result.text.trim(),
    meta: metaFrom(result, null),
  };
}
