// Unit tests for the safe-by-default email sender guard (pure, no DB/config).
import { describe, it, expect } from 'vitest';
import { checkSendableFrom } from '../src/modules/messages/sendGuard';

const live = (verifiedDomains: string[] = []) => ({ useMock: false, verifiedDomains });

describe('checkSendableFrom', () => {
  it('allows anything in mock mode', () => {
    expect(checkSendableFrom('outreach@example.com', { useMock: true, verifiedDomains: [] }).ok).toBe(true);
  });

  it('refuses placeholder domains on live sends', () => {
    const res = checkSendableFrom('outreach@example.com', live());
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('placeholder');
  });

  it('always allows the resend.dev test sink', () => {
    expect(checkSendableFrom('onboarding@resend.dev', live()).ok).toBe(true);
    expect(checkSendableFrom('x@mail.resend.dev', live()).ok).toBe(true);
  });

  it('refuses a domain not on a configured allowlist', () => {
    const res = checkSendableFrom('marketing@randomco.com', live(['orangekloud.com', 'gmail.com']));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('not in EMAIL_VERIFIED_DOMAINS');
  });

  it('allows a domain on the allowlist', () => {
    expect(checkSendableFrom('marketing@orangekloud.com', live(['orangekloud.com', 'gmail.com'])).ok).toBe(true);
    expect(checkSendableFrom('shaamel.orangekloud@gmail.com', live(['orangekloud.com', 'gmail.com'])).ok).toBe(true);
  });

  it('allows any non-placeholder domain when no allowlist is set', () => {
    expect(checkSendableFrom('hi@somebrand.io', live([])).ok).toBe(true);
  });

  it('rejects an address with no domain', () => {
    expect(checkSendableFrom('not-an-email', live()).ok).toBe(false);
  });

  it('is case-insensitive on the domain', () => {
    expect(checkSendableFrom('Marketing@OrangeKloud.com', live(['orangekloud.com'])).ok).toBe(true);
    expect(checkSendableFrom('a@EXAMPLE.COM', live()).ok).toBe(false);
  });
});
