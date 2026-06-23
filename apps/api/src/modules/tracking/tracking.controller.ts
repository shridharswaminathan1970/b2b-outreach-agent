// Public tracking endpoints (no auth — trust is established by the signed token).
//   GET /t/o/:token.gif  → records an open, returns a 1x1 transparent gif
//   GET /t/u/:token      → unsubscribe landing (records unsubscribe → suppress)
//   POST /t/u/:token     → RFC 8058 one-click unsubscribe (List-Unsubscribe-Post)
import type { Request, Response, NextFunction } from 'express';
import { verifyTrackingToken } from './tracking.tokens';
import { ingestEventForMessage } from '../messages/messages.service';
import { logger } from '../../utils/logger';

// 1x1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function sendPixel(res: Response): void {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(PIXEL);
}

export async function openPixelHandler(req: Request, res: Response): Promise<void> {
  // Strip a trailing ".gif" some clients keep, then verify.
  const raw = String(req.params.token || '').replace(/\.gif$/i, '');
  const messageId = verifyTrackingToken(raw, 'o');
  if (messageId) {
    // Best-effort: never let tracking failures affect the pixel response.
    ingestEventForMessage(messageId, { eventType: 'open' }).catch((err) =>
      logger.warn('open tracking failed', { message: err instanceof Error ? err.message : String(err) }),
    );
  }
  sendPixel(res); // always return the pixel, valid token or not
}

function unsubscribePage(done: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;text-align:center;color:#1f2937">
<h2>${done ? 'You have been unsubscribed' : 'Unsubscribe'}</h2>
<p>${done ? 'You will no longer receive these emails.' : 'This link is invalid or expired.'}</p>
</body></html>`;
}

export async function unsubscribeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const messageId = verifyTrackingToken(String(req.params.token || ''), 'u');
    let done = false;
    if (messageId) {
      done = await ingestEventForMessage(messageId, { eventType: 'unsubscribe' });
    }
    // One-click POST (RFC 8058): mail clients expect a 200 with no body needed.
    if (req.method === 'POST') {
      res.status(done ? 200 : 400).json({ success: done });
      return;
    }
    res.status(done ? 200 : 400).type('html').send(unsubscribePage(done));
  } catch (err) {
    next(err);
  }
}
