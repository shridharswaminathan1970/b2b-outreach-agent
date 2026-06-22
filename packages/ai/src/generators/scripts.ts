// Next-step script generator (IGNITE-APEX REPORT, section 8). Turns the captured
// diagnosis — root cause, Pain→Impact→ROI, champion, verdict — into ready-to-use
// rep scripts for five common situations. Generic: parameterised by the
// company's ProductContext, with a deterministic mock fallback.
import { callClaude } from '../client';
import { extractJson, metaFrom, GENERIC_PRODUCT, type AiResult, type ProductContext } from '../types';

export const SCRIPT_SITUATIONS = [
  { id: 'discovery_followup', label: 'Discovery follow-up' },
  { id: 'objection_handle', label: 'Objection handling' },
  { id: 'champion_enable', label: 'Enabling your champion' },
  { id: 'economic_buyer_ask', label: 'Reaching the economic buyer' },
  { id: 'closing', label: 'Closing / commercial ask' },
] as const;

export interface ScriptsInput {
  contactName: string;
  company?: string | null;
  product?: ProductContext | null;
  verdict?: string | null;
  rootCause?: { l1Symptom?: string; l2Structural?: string; l3Root?: string } | null;
  pain?: string | null;
  impact?: string | null;
  roi?: string | null;
  championName?: string | null;
  objection?: string | null;
  companyId?: string | null;
}

export interface NextStepScript {
  situation: string;
  label: string;
  script: string;
}

export type ScriptsResult = AiResult<{ scripts: NextStepScript[] }>;

function labelFor(id: string): string {
  return SCRIPT_SITUATIONS.find((s) => s.id === id)?.label ?? id;
}

function mockScripts(input: ScriptsInput, product: ProductContext): NextStepScript[] {
  const first = input.contactName.split(' ')[0] || input.contactName;
  const pain = input.pain || 'the bottleneck we discussed';
  const impact = input.impact || 'the cost it is creating';
  const roi = input.roi || 'the value you put on fixing it';
  const root = input.rootCause?.l3Root || input.rootCause?.l2Structural || pain;
  const champion = input.championName || 'your sponsor';
  return [
    {
      situation: 'discovery_followup',
      label: labelFor('discovery_followup'),
      script: `Hi ${first} — following up on ${pain}. You framed the real driver as "${root}". Before we go further, can we confirm ${impact} is the number leadership is trying to move?`,
    },
    {
      situation: 'objection_handle',
      label: labelFor('objection_handle'),
      script: `${input.objection ? `On "${input.objection}": ` : ''}Fair question. The reason this keeps recurring is "${root}". If that stays unaddressed, ${impact} continues — what would change your mind about acting on it now?`,
    },
    {
      situation: 'champion_enable',
      label: labelFor('champion_enable'),
      script: `${champion}, to take this internally you'll need three things: the root cause ("${root}"), the impact (${impact}), and the year-one value (${roi}). I'll package those so you can forward them without editing.`,
    },
    {
      situation: 'economic_buyer_ask',
      label: labelFor('economic_buyer_ask'),
      script: `${champion}, given the impact is ${impact}, it makes sense to get 20 minutes with whoever owns that number. Could you make that introduction this week?`,
    },
    {
      situation: 'closing',
      label: labelFor('closing'),
      script: `${first}, we've agreed the cause is "${root}", the cost is ${impact}, and the year-one value of fixing it is ${roi}. ${product.productName} addresses exactly that. Are you ready to move to next steps on timing and terms?`,
    },
  ];
}

export async function generateNextStepScripts(input: ScriptsInput): Promise<ScriptsResult> {
  const product: ProductContext = input.product ?? GENERIC_PRODUCT;

  const userContent = [
    `Vendor: ${product.vendorName} — ${product.productName} (${product.category}): ${product.valueProp}.`,
    `Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ''}.`,
    `Qualification verdict: ${input.verdict ?? 'unknown'}.`,
    `Root cause (their words): ${input.rootCause?.l3Root ?? '—'}.`,
    `Pain: ${input.pain ?? '—'} | Impact: ${input.impact ?? '—'} | Year-one ROI: ${input.roi ?? '—'}.`,
    `Champion: ${input.championName ?? '—'}.`,
    input.objection ? `Live objection: ${input.objection}.` : '',
    '',
    'Write concise, specific rep scripts for these situations: ' +
      SCRIPT_SITUATIONS.map((s) => `"${s.id}" (${s.label})`).join(', ') +
      '. Use their exact root-cause language and the impact/ROI numbers. No fluff.',
    'Return ONLY JSON: {"scripts":[{"situation":"<id>","script":"<text>"}]}.',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callClaude({
    purpose: 'next_step_scripts',
    model: 'claude-sonnet-4-6',
    maxTokens: 1200,
    temperature: 0.5,
    system:
      'You are a demand-gen sales coach. Produce practical scripts grounded in the diagnosis provided. Output strict JSON only.',
    userContent,
    promptVersionId: null,
    mock: () => JSON.stringify({ scripts: mockScripts(input, product) }),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<{ scripts?: Array<{ situation?: string; script?: string }> }>(result.text);
  const scripts: NextStepScript[] =
    parsed?.scripts && Array.isArray(parsed.scripts)
      ? parsed.scripts
          .filter((s) => s.situation && s.script)
          .map((s) => ({ situation: s.situation as string, label: labelFor(s.situation as string), script: s.script as string }))
      : mockScripts(input, product);

  return { ok: true, scripts, meta: metaFrom(result, null) };
}
