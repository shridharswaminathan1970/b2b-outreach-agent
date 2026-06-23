// Renders an outbound email's HTML part with an open-tracking pixel + an
// unsubscribe footer, and the matching List-Unsubscribe headers (RFC 8058
// one-click). Given the plain-text body + the message id.
import { trackingUrls } from './tracking.tokens';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TrackedEmail {
  html: string;
  headers: Record<string, string>;
}

// Build the HTML body (escaped text + <br>), append the 1x1 pixel and an
// unsubscribe link, and return the List-Unsubscribe headers for the message.
export function renderTrackedEmail(messageId: string, textBody: string): TrackedEmail {
  const { pixel, unsubscribe } = trackingUrls(messageId);
  const bodyHtml = escapeHtml(textBody).replace(/\r?\n/g, '<br>');

  const html = `<!doctype html><html><body style="margin:0;padding:0">
<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${bodyHtml}</div>
<div style="font-family:system-ui,Arial,sans-serif;font-size:11px;color:#9ca3af;margin-top:24px">
<a href="${unsubscribe}" style="color:#9ca3af">Unsubscribe</a>
</div>
<img src="${pixel}" width="1" height="1" alt="" style="display:none" />
</body></html>`;

  return {
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
