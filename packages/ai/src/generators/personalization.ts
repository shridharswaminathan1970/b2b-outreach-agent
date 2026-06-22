// Personalization engine: takes an already-generated draft plus contact-specific
// facts (and optional knowledge snippets) and rewrites it to weave in concrete
// details, without changing the demand-gen guardrails. There is no dedicated DB
// prompt for this transformation, so it runs with an inline system instruction
// (promptVersionId = null); the mock guarantees the contact's name + company
// appear.
import { callClaude } from '../client';
import { metaFrom, type AiResult } from '../types';
import type { TouchBranding } from './draft';

export interface PersonalizationInput {
  subject: string;
  body: string;
  contactName: string;
  company?: string | null;
  title?: string | null;
  facts?: string[]; // contact-specific specifics to weave in
  snippets?: string[]; // relevant knowledge-base snippets
  branding?: TouchBranding;
  // Vendor/product name kept in the signature when branding=signature_only.
  vendorName?: string | null;
}

export type PersonalizationResult = AiResult<{ subject: string; body: string }>;

function mockPersonalize(input: PersonalizationInput): string {
  const first = input.contactName.split(' ')[0] || input.contactName;
  let body = input.body;
  // Ensure the recipient is addressed by name.
  if (!new RegExp(`\\b${first}\\b`, 'i').test(body)) {
    body = `Hi ${first},\n\n${body}`;
  }
  // Weave in the first concrete fact, if any.
  if (input.facts && input.facts.length > 0) {
    body += `\n\nNoticed: ${input.facts[0]}`;
  }
  return `Subject: ${input.subject}\n\n${body}`;
}

function parse(text: string, fallbackSubject: string): { subject: string; body: string } {
  const match = text.match(/^\s*subject:\s*(.+)$/im);
  if (match) {
    const subject = match[1].trim();
    const body = text.slice(text.indexOf(match[0]) + match[0].length).replace(/^\s+/, '');
    return { subject, body: body.trim() || text.trim() };
  }
  return { subject: fallbackSubject, body: text.trim() };
}

export async function personalizeDraft(
  input: PersonalizationInput,
): Promise<PersonalizationResult> {
  const systemParts = [
    'You refine an outreach email to be more specific to the recipient. Keep it concise and natural.',
    'Format: first line "Subject: <one-line subject>", then a blank line, then the body.',
    'Do not add sales pressure or product pitches that were not already present.',
  ];
  if (input.branding === 'signature_only') {
    systemParts.push(
      `Any ${input.vendorName ? `${input.vendorName} ` : 'vendor/product '}mention stays in the signature only.`,
    );
  }

  const userParts = [
    `Recipient: ${input.contactName}${input.title ? `, ${input.title}` : ''}${input.company ? ` at ${input.company}` : ''}`,
    input.facts?.length ? `Contact-specific facts:\n- ${input.facts.join('\n- ')}` : '',
    input.snippets?.length ? `Relevant context:\n- ${input.snippets.join('\n- ')}` : '',
    `\nCurrent draft:\nSubject: ${input.subject}\n\n${input.body}`,
  ].filter(Boolean);

  const result = await callClaude({
    purpose: 'personalization',
    model: 'claude-sonnet-4-6',
    maxTokens: 1500,
    temperature: 0.6,
    system: systemParts.join(' '),
    userContent: userParts.join('\n\n'),
    promptVersionId: null,
    mock: () => mockPersonalize(input),
  });

  if (!result.ok) return { ok: false, error: result.error };
  const { subject, body } = parse(result.text, input.subject);
  return { ok: true, subject, body, meta: metaFrom(result, null) };
}
