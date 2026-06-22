// Thin provider-send abstraction used by the Messages service. When mock mode is
// off it delegates to the shared @outreach/integrations email adapter (Resend),
// so the API send path and the worker sending job go through the same provider
// code. config.email.useMock forces mock (also true when RESEND_API_KEY absent).
import { randomUUID } from 'node:crypto';
import { getEmailAdapter } from '@outreach/integrations';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface OutboundEmail {
  to: string;
  from: string;
  subject: string;
  body: string;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
  accepted: boolean;
}

// Mock provider: pretends to accept the message and returns a synthetic id.
// Never logs the body (CODE QUALITY: no sensitive content in logs).
async function mockSend(email: OutboundEmail): Promise<SendResult> {
  logger.info('mock email send', { to: email.to, subject: email.subject });
  return {
    provider: 'mock',
    providerMessageId: `mock_${randomUUID()}`,
    accepted: true,
  };
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  if (config.email.useMock) {
    return mockSend(email);
  }
  // Live send via the shared email adapter (Resend). The adapter selects
  // live-vs-mock from its own config; with a real key it sends for real.
  const adapter = getEmailAdapter();
  const result = await adapter.send({
    to: email.to,
    from: email.from,
    subject: email.subject,
    body: email.body,
  });
  return {
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    accepted: result.accepted,
  };
}
