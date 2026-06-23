// Public ingress routes for email tracking. Mounted at the app root (NOT under
// /api) and require NO auth — open pixels / unsubscribe links / provider webhooks
// are hit by mail clients and external services. Trust is established by a signed
// token (pixel/unsubscribe) or a verified Svix signature (Resend webhook).
import { Router, raw } from 'express';
import { openPixelHandler, unsubscribeHandler } from './tracking.controller';
import { resendWebhookHandler } from './resend.webhook';

const router = Router();

// Open pixel + unsubscribe (token-signed).
router.get('/t/o/:token', openPixelHandler);
router.get('/t/u/:token', unsubscribeHandler);
router.post('/t/u/:token', unsubscribeHandler); // RFC 8058 one-click

// Resend webhook — raw body so the Svix signature can be verified over exact bytes.
router.post('/webhooks/resend', raw({ type: '*/*' }), resendWebhookHandler);

export default router;
