// Integration provider configuration + live/mock detection. As with the AI
// layer, each provider falls back to a deterministic mock when its key is absent
// or still the .env.example placeholder (CLAUDE.md: use the mock adapter when an
// external key is unavailable).
function clean(v: string | undefined): string {
  return (v ?? '').trim();
}

const PLACEHOLDERS = new Set([
  '',
  're_your_resend_api_key_here',
  'your_apollo_api_key_here',
  'pat-na1-your-hubspot-access-token',
]);

function isReal(value: string): boolean {
  return !PLACEHOLDERS.has(value);
}

export const integrationsConfig = {
  email: {
    resendApiKey: clean(process.env.RESEND_API_KEY),
    fromAddress: clean(process.env.EMAIL_FROM_ADDRESS) || 'outreach@example.com',
    fromName: clean(process.env.EMAIL_FROM_NAME) || 'Outreach',
    replyTo: clean(process.env.EMAIL_REPLY_TO) || undefined,
    // Explicit override to force mock even if a key is present (tests).
    forceMock: clean(process.env.USE_MOCK_EMAIL) === 'true',
    // SMTP (nodemailer) — used in preference to Resend when SMTP_USER is set.
    // Sends through an existing authenticated mailbox (e.g. Google Workspace /
    // M365), so no Resend domain verification is needed.
    smtp: {
      host: clean(process.env.SMTP_HOST),
      port: Number(clean(process.env.SMTP_PORT)) || 587,
      user: clean(process.env.SMTP_USER),
      pass: clean(process.env.SMTP_PASS),
      from: clean(process.env.SMTP_FROM),
    },
  },
  enrichment: {
    apolloApiKey: clean(process.env.APOLLO_API_KEY),
    apolloBaseUrl: clean(process.env.APOLLO_API_BASE_URL) || 'https://api.apollo.io/api/v1',
    forceMock: clean(process.env.USE_MOCK_ENRICHMENT) === 'true',
  },
  crm: {
    hubspotToken: clean(process.env.HUBSPOT_ACCESS_TOKEN),
    forceMock: clean(process.env.USE_MOCK_CRM) === 'true',
  },
};

// SMTP is the chosen live transport when a username is configured (and mock is
// not forced). Takes precedence over Resend in the factory.
export function smtpIsLive(): boolean {
  return !integrationsConfig.email.forceMock && integrationsConfig.email.smtp.user.length > 0;
}

// Any live email transport available? (SMTP or Resend.) Used by the factory to
// decide live-vs-mock; the specific transport is chosen in getEmailAdapter().
export function emailIsLive(): boolean {
  return smtpIsLive() || (!integrationsConfig.email.forceMock && isReal(integrationsConfig.email.resendApiKey));
}
export function enrichmentIsLive(): boolean {
  return (
    !integrationsConfig.enrichment.forceMock && isReal(integrationsConfig.enrichment.apolloApiKey)
  );
}
export function crmIsLive(): boolean {
  return !integrationsConfig.crm.forceMock && isReal(integrationsConfig.crm.hubspotToken);
}
