// Resend email adapter (live). Selected by the factory only when a real
// RESEND_API_KEY is present. Resend does not expose per-message event polling on
// the send API (events arrive via webhook → recorded through the messages
// /:id/events endpoint), so getDeliveryEvents returns [].
import { Resend } from 'resend';
import { integrationsConfig } from '../config';
import type {
  EmailAdapter,
  OutboundMessage,
  SendResult,
  DeliveryEvent,
} from '../types';

export class ResendEmailAdapter implements EmailAdapter {
  public readonly provider = 'resend';

  private client: Resend;

  constructor(apiKey: string = integrationsConfig.email.resendApiKey) {
    this.client = new Resend(apiKey);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });

    if (error) {
      // Surface as a thrown error so the caller's retry/failure path engages.
      throw new Error(`Resend send failed: ${error.message}`);
    }

    return {
      provider: this.provider,
      providerMessageId: data?.id ?? '',
      accepted: Boolean(data?.id),
    };
  }

  async getDeliveryEvents(_providerMessageId: string): Promise<DeliveryEvent[]> {
    // Delivery events arrive via Resend webhooks, not a poll API.
    return [];
  }
}
