// Pure Resend/Svix helpers (no service/DB imports) so they're unit-testable in
// isolation: signature verification + event-type mapping.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RecordEventInput } from '../messages/messages.schema';

// Verify a Svix-signed payload. secret is "whsec_<base64>"; the signing key is
// the base64-decoded remainder. signedContent = `${id}.${timestamp}.${body}`.
// The svix-signature header is space-separated "v1,<base64sig>" entries.
export function verifySvix(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const part of headers.signature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}

// Map a Resend event type to our deliverability event (null = ignore).
export function mapResendEvent(type: string): RecordEventInput | null {
  switch (type) {
    case 'email.delivered':
      return { eventType: 'delivered' };
    case 'email.opened':
      return { eventType: 'open' };
    case 'email.clicked':
      return { eventType: 'click' };
    case 'email.bounced':
      return { eventType: 'bounce', bounceType: 'hard' };
    case 'email.complained':
      return { eventType: 'complaint' };
    default:
      return null; // email.sent / delivery_delayed / etc.
  }
}
