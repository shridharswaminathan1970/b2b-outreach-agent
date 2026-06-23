// Public API for @outreach/integrations. Callers use the factories
// (getEmailAdapter / getEnrichmentAdapter / getCrmAdapter) and depend only on the
// adapter interfaces in ./types — never on a specific vendor.
export * from './types';
export {
  integrationsConfig,
  emailIsLive,
  smtpIsLive,
  enrichmentIsLive,
  crmIsLive,
} from './config';

export { getEmailAdapter, ResendEmailAdapter, SmtpEmailAdapter, MockEmailAdapter } from './email';
export {
  getEnrichmentAdapter,
  ApolloEnrichmentAdapter,
  MockEnrichmentAdapter,
} from './enrichment';
export { getCrmAdapter, HubspotCrmAdapter, MockCrmAdapter } from './crm';
