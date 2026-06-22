// Email adapter factory: returns the live Resend adapter when a real key is
// configured, otherwise the mock. Memoized so callers share one instance.
import type { EmailAdapter } from '../types';
import { emailIsLive } from '../config';
import { ResendEmailAdapter } from './resend.adapter';
import { MockEmailAdapter } from '../mock/email.mock';

let instance: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (!instance) {
    instance = emailIsLive() ? new ResendEmailAdapter() : new MockEmailAdapter();
  }
  return instance;
}

export { ResendEmailAdapter, MockEmailAdapter };
