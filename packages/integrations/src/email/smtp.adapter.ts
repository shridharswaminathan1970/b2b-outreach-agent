// SMTP email adapter (live), via nodemailer. Selected by the factory when
// SMTP_USER is configured and mock is not forced. Sends through an existing
// authenticated mailbox (e.g. Google Workspace / Microsoft 365 with an app
// password), so it needs no Resend-style domain verification — the mail host
// already owns the domain's SPF/DKIM.
//
// Like the Resend adapter, delivery events arrive out-of-band (the mailbox/host
// doesn't expose a per-message poll API), so getDeliveryEvents returns [].
import nodemailer, { type Transporter } from 'nodemailer';
import { integrationsConfig } from '../config';
import type {
  EmailAdapter,
  OutboundMessage,
  SendResult,
  DeliveryEvent,
} from '../types';

export class SmtpEmailAdapter implements EmailAdapter {
  public readonly provider = 'smtp';

  private transporter: Transporter;

  // Default from-address (SMTP_FROM, else the SMTP user) used when a message
  // doesn't carry one.
  private defaultFrom: string;

  constructor(cfg: typeof integrationsConfig.email.smtp = integrationsConfig.email.smtp) {
    this.defaultFrom = cfg.from || cfg.user;
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      // 465 = implicit TLS; otherwise STARTTLS is negotiated on 587/25.
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: message.from || this.defaultFrom,
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });

      // nodemailer marks recipients it couldn't hand off in `rejected`.
      const accepted = (info.accepted?.length ?? 0) > 0 && (info.rejected?.length ?? 0) === 0;
      if (!accepted) {
        throw new Error(`SMTP server rejected recipient(s): ${(info.rejected ?? []).join(', ') || 'unknown'}`);
      }

      return {
        provider: this.provider,
        providerMessageId: info.messageId ?? '',
        accepted: true,
      };
    } catch (err) {
      // Surface as a thrown error so the caller's failure path engages (and the
      // messages service reports the provider reason).
      throw new Error(`SMTP send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getDeliveryEvents(_providerMessageId: string): Promise<DeliveryEvent[]> {
    return [];
  }
}
