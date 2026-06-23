// Resend inbound webhook receiver. Resend signs webhooks with Svix; we verify the
// signature with node crypto (no svix dependency), then map the event to our
// deliverability model via the provider message id. Only active when sending
// through Resend (no-op for Gmail SMTP, which has no event webhooks).
//
// The route mounts express.raw() so req.body is the exact bytes Svix signed.
import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { ingestEventByProviderMessageId } from '../messages/messages.service';
import { verifySvix, mapResendEvent } from './resend.verify';
import { logger } from '../../utils/logger';

export async function resendWebhookHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!config.resendWebhookSecret) {
      res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Resend webhook not configured' } });
      return;
    }

    // req.body is a Buffer (express.raw). Verify signature over the exact bytes.
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const ok = verifySvix(config.resendWebhookSecret, {
      id: req.header('svix-id') ?? undefined,
      timestamp: req.header('svix-timestamp') ?? undefined,
      signature: req.header('svix-signature') ?? undefined,
    }, rawBody);
    if (!ok) {
      res.status(401).json({ success: false, error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
      return;
    }

    const event = JSON.parse(rawBody) as { type?: string; data?: { email_id?: string } };
    const mapped = event.type ? mapResendEvent(event.type) : null;
    const providerMessageId = event.data?.email_id;

    if (mapped && providerMessageId) {
      const found = await ingestEventByProviderMessageId(providerMessageId, {
        ...mapped,
        payload: event as Record<string, unknown>,
      });
      if (!found) logger.warn('resend webhook: no message for provider id', { providerMessageId });
    }

    // Always 200 so Resend doesn't retry a well-formed, signed event.
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
