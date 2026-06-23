// Email adapter factory. Live transport precedence:
//   1. SMTP (nodemailer) — when SMTP_USER is set and mock isn't forced
//   2. Resend — when a real RESEND_API_KEY is set
//   3. Mock — otherwise (or when USE_MOCK_EMAIL=true)
// Memoized so callers share one instance.
import type { EmailAdapter } from '../types';
import { emailIsLive, smtpIsLive } from '../config';
import { ResendEmailAdapter } from './resend.adapter';
import { SmtpEmailAdapter } from './smtp.adapter';
import { MockEmailAdapter } from '../mock/email.mock';

let instance: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (!instance) {
    if (smtpIsLive()) {
      instance = new SmtpEmailAdapter();
    } else if (emailIsLive()) {
      instance = new ResendEmailAdapter();
    } else {
      instance = new MockEmailAdapter();
    }
  }
  return instance;
}

export { ResendEmailAdapter, SmtpEmailAdapter, MockEmailAdapter };
