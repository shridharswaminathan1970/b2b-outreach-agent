// Pure, dependency-free sender-guard logic (safe-by-default email sending).
// Kept standalone so it can be unit-tested without loading config/prisma. The
// service wraps checkSendableFrom() with runtime config + throws (see
// messages.service.assertSendableFrom).

// Domains that are clearly placeholders / never deliverable — a live send from
// these is almost certainly a misconfiguration, so we refuse it.
export const PLACEHOLDER_FROM_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'localhost',
]);

export interface SendGuardOptions {
  useMock: boolean;
  verifiedDomains: string[];
}

export interface SendGuardResult {
  ok: boolean;
  reason?: string;
}

// Decide whether a live send may use this from-address. Mock sends are always
// allowed. Resend's shared test sender (*.resend.dev) is always allowed. Otherwise
// placeholder domains are refused, and — when an allowlist is configured — any
// domain not on it is refused.
export function checkSendableFrom(fromAddress: string, opts: SendGuardOptions): SendGuardResult {
  if (opts.useMock) return { ok: true };

  const domain = fromAddress.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return { ok: false, reason: 'Invalid from-address' };

  if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) return { ok: true };

  if (PLACEHOLDER_FROM_DOMAINS.has(domain)) {
    return {
      ok: false,
      reason: `Refusing to send from placeholder domain "${domain}". Set EMAIL_FROM_ADDRESS to an address on your verified sending domain.`,
    };
  }

  const allow = opts.verifiedDomains;
  if (allow.length > 0 && !allow.includes(domain)) {
    return {
      ok: false,
      reason: `From-domain "${domain}" is not in EMAIL_VERIFIED_DOMAINS (${allow.join(', ')}). Use a verified sending domain.`,
    };
  }

  return { ok: true };
}
