// Research brief generator: takes contact + account data and returns a short
// structured brief used to ground the draft generator. Uses the active
// 'research_brief' prompt from the registry; falls back to a deterministic brief
// in mock mode.
import { callClaude } from '../client';
import { getActivePrompt, renderPrompt } from '../registry';
import { metaFrom, GENERIC_PRODUCT, type AiResult, type ProductContext } from '../types';

export interface ResearchInput {
  contactName: string;
  company?: string | null;
  title?: string | null;
  painPoints?: string | null;
  // The selling company's product/market context (drives the brief framing).
  product?: ProductContext | null;
  companyId?: string | null;
}

export type ResearchResult = AiResult<{ brief: string }>;

function mockBrief(input: ResearchInput, product: ProductContext): string {
  const company = input.company || 'their company';
  const title = input.title || 'a decision maker';
  return [
    `- ${input.contactName} is ${title} at ${company}; likely owns or influences decisions relevant to ${product.category}.`,
    `- Probable priorities: outcomes connected to ${product.valueProp.toLowerCase()}.`,
    `- Likely pain: ${input.painPoints || `the problem ${product.productName} addresses in ${product.market}`}.`,
    `- Relevant hook: operational intelligence framed around ${product.valueProp.toLowerCase()} — no pitch.`,
  ].join('\n');
}

export async function generateResearchBrief(
  input: ResearchInput,
): Promise<ResearchResult> {
  const product: ProductContext = input.product ?? GENERIC_PRODUCT;
  const prompt = await getActivePrompt('research_brief', input.companyId);

  const userContent = prompt
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
    : mockBrief(input, product);

  const result = await callClaude({
    purpose: 'research_brief',
    model: prompt?.modelName ?? 'claude-sonnet-4-6',
    maxTokens: prompt?.maxTokens ?? 800,
    temperature: prompt?.temperature ?? 0.3,
    userContent,
    promptVersionId: prompt?.id ?? null,
    mock: () => mockBrief(input, product),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, brief: result.text, meta: metaFrom(result, prompt?.id ?? null) };
}
