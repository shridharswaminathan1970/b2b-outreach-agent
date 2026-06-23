// Signed tokens for the public tracking endpoints (open pixel + unsubscribe).
// A token embeds the message id and a kind ('o' open | 'u' unsubscribe), HMAC-
// signed so the public endpoints can trust it without auth. Pure + dependency-
// light (node crypto + the configured secret).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config';

export type TokenKind = 'o' | 'u';

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

// token = <kind>.<base64url(messageId)>.<sig>
export function signTrackingToken(messageId: string, kind: TokenKind, secret = config.tracking.secret): string {
  const body = `${kind}.${b64url(messageId)}`;
  return `${body}.${sign(body, secret)}`;
}

// Returns the message id if the token is valid for the given kind, else null.
export function verifyTrackingToken(
  token: string,
  kind: TokenKind,
  secret = config.tracking.secret,
): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [k, encId, sig] = parts;
  if (k !== kind) return null;

  const expected = sign(`${k}.${encId}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const id = Buffer.from(encId, 'base64url').toString('utf8');
    return id || null;
  } catch {
    return null;
  }
}

// Build the absolute URLs embedded in an outbound email for a given message.
export function trackingUrls(messageId: string): { pixel: string; unsubscribe: string } {
  const base = config.tracking.publicUrl.replace(/\/$/, '');
  return {
    pixel: `${base}/t/o/${signTrackingToken(messageId, 'o')}.gif`,
    unsubscribe: `${base}/t/u/${signTrackingToken(messageId, 'u')}`,
  };
}
