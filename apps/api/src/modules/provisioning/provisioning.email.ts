// Provisioning emails: (1) notify the platform owner of a new signup request,
// (2) send the approved requester their set-password / auto-login link. Uses the
// shared email sender (SMTP/Resend live, mock otherwise); failures are surfaced to
// the caller so the console can show whether the email actually went out.
import { sendEmail } from '../messages/messages.sender';
import { config } from '../../config';
import { logger } from '../../utils/logger';

interface RequestSummary {
  companyName: string;
  fullName: string;
  email: string;
  contactNumber?: string | null;
  country?: string | null;
}

// (1) → platform owner. Subject exactly as specified.
export async function sendOwnerNotification(req: RequestSummary): Promise<void> {
  const body = [
    'A new B2B Outreach Agent signup request was submitted:',
    '',
    `Company:  ${req.companyName}`,
    `Name:     ${req.fullName}`,
    `Email:    ${req.email}`,
    `Phone:    ${req.contactNumber ?? '—'}`,
    `Country:  ${req.country ?? '—'}`,
    '',
    `Review and approve it in the platform console: ${config.webAppUrl.replace(/\/$/, '')}/platform`,
  ].join('\n');

  try {
    await sendEmail({
      to: config.platformOwnerEmail,
      from: config.email.fromAddress,
      subject: 'b2bo Agent super admin account creation',
      body,
    });
  } catch (err) {
    // Non-fatal: the request is stored regardless; the owner can still see it in
    // the console. Just log so we know the notification didn't send.
    logger.warn('provisioning: owner notification email failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// (2) → the approved requester. Returns false if the email failed so the console
// can show the link for manual delivery.
export async function sendResetLink(toEmail: string, name: string, resetUrl: string): Promise<boolean> {
  const body = [
    `Hi ${name},`,
    '',
    'Your B2B Outreach Agent account has been approved. Click the link below to set',
    'your password — you’ll be signed in automatically:',
    '',
    resetUrl,
    '',
    'This link expires in 24 hours.',
  ].join('\n');

  try {
    await sendEmail({
      to: toEmail,
      from: config.email.fromAddress,
      subject: 'Your B2B Outreach Agent account — set your password',
      body,
    });
    return true;
  } catch (err) {
    logger.warn('provisioning: reset-link email failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
