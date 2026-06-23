// Unit tests for email tracking: token sign/verify, Resend event mapping, and
// Svix signature verification (all pure, no DB/network).
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signTrackingToken, verifyTrackingToken } from '../src/modules/tracking/tracking.tokens';
import { verifySvix, mapResendEvent } from '../src/modules/tracking/resend.verify';

const SECRET = 'test-tracking-secret';

describe('tracking tokens', () => {
  it('round-trips a message id for the right kind', () => {
    const t = signTrackingToken('msg-123', 'o', SECRET);
    expect(verifyTrackingToken(t, 'o', SECRET)).toBe('msg-123');
  });

  it('rejects a token used for the wrong kind', () => {
    const open = signTrackingToken('msg-123', 'o', SECRET);
    expect(verifyTrackingToken(open, 'u', SECRET)).toBeNull();
  });

  it('rejects a tampered token', () => {
    const t = signTrackingToken('msg-123', 'o', SECRET);
    const tampered = t.slice(0, -2) + (t.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyTrackingToken(tampered, 'o', SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const t = signTrackingToken('msg-123', 'o', SECRET);
    expect(verifyTrackingToken(t, 'o', 'other-secret')).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyTrackingToken('garbage', 'o', SECRET)).toBeNull();
    expect(verifyTrackingToken('a.b', 'o', SECRET)).toBeNull();
  });
});

describe('mapResendEvent', () => {
  it('maps known Resend types to our event model', () => {
    expect(mapResendEvent('email.delivered')).toEqual({ eventType: 'delivered' });
    expect(mapResendEvent('email.opened')).toEqual({ eventType: 'open' });
    expect(mapResendEvent('email.clicked')).toEqual({ eventType: 'click' });
    expect(mapResendEvent('email.bounced')).toEqual({ eventType: 'bounce', bounceType: 'hard' });
    expect(mapResendEvent('email.complained')).toEqual({ eventType: 'complaint' });
  });

  it('ignores unmapped types', () => {
    expect(mapResendEvent('email.sent')).toBeNull();
    expect(mapResendEvent('email.delivery_delayed')).toBeNull();
  });
});

describe('verifySvix', () => {
  // Build a valid Svix signature the way Resend/Svix does.
  const secret = 'whsec_' + Buffer.from('super-secret-key').toString('base64');
  const id = 'msg_2abc';
  const timestamp = '1700000000';
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc' } });
  function sign(s: string, i: string, ts: string, b: string): string {
    const key = Buffer.from(s.replace(/^whsec_/, ''), 'base64');
    return createHmac('sha256', key).update(`${i}.${ts}.${b}`).digest('base64');
  }

  it('accepts a correctly signed payload', () => {
    const sig = `v1,${sign(secret, id, timestamp, body)}`;
    expect(verifySvix(secret, { id, timestamp, signature: sig }, body)).toBe(true);
  });

  it('accepts when multiple signatures are present and one matches', () => {
    const good = sign(secret, id, timestamp, body);
    const sig = `v1,AAAAwrongAAAA v1,${good}`;
    expect(verifySvix(secret, { id, timestamp, signature: sig }, body)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = `v1,${sign(secret, id, timestamp, body)}`;
    expect(verifySvix(secret, { id, timestamp, signature: sig }, body + 'x')).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = `v1,${sign(secret, id, timestamp, body)}`;
    const other = 'whsec_' + Buffer.from('different-key').toString('base64');
    expect(verifySvix(other, { id, timestamp, signature: sig }, body)).toBe(false);
  });

  it('rejects missing headers or empty secret', () => {
    const sig = `v1,${sign(secret, id, timestamp, body)}`;
    expect(verifySvix('', { id, timestamp, signature: sig }, body)).toBe(false);
    expect(verifySvix(secret, { id, timestamp }, body)).toBe(false);
  });
});
