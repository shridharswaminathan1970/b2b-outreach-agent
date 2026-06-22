// Mock email adapter: accepts every message and returns a synthetic id. Never
// logs message bodies (CODE QUALITY: no sensitive content in logs). Used whenever
// RESEND_API_KEY is absent or USE_MOCK_EMAIL=true.
import { randomUUID } from 'node:crypto';
import type {
  EmailAdapter,
  OutboundMessage,
  SendResult,
  DeliveryEvent,
} from '../types';

export class MockEmailAdapter implements EmailAdapter {
  public readonly provider = 'mock';

  async send(message: OutboundMessage): Promise<SendResult> {
    return {
      provider: this.provider,
      providerMessageId: `mock_${randomUUID()}`,
      accepted: Boolean(message.to),
    };
  }

  async getDeliveryEvents(providerMessageId: string): Promise<DeliveryEvent[]> {
    // Mock provider reports a single synthetic "delivered" event.
    return [
      {
        provider: this.provider,
        providerMessageId,
        eventType: 'delivered',
        eventAt: new Date(),
      },
    ];
  }
}
