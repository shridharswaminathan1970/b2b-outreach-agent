// CRM adapter factory: live HubSpot adapter when a real token is configured,
// otherwise the mock. Memoized.
import type { CrmAdapter } from '../types';
import { crmIsLive } from '../config';
import { HubspotCrmAdapter } from './hubspot.adapter';
import { MockCrmAdapter } from '../mock/crm.mock';

let instance: CrmAdapter | null = null;

export function getCrmAdapter(): CrmAdapter {
  if (!instance) {
    instance = crmIsLive() ? new HubspotCrmAdapter() : new MockCrmAdapter();
  }
  return instance;
}

export { HubspotCrmAdapter, MockCrmAdapter };
