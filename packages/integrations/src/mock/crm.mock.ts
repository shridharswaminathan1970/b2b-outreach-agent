// Mock CRM adapter: logs the sync intent and returns synthetic ids so the CRM
// sync path works without a HubSpot token. Used whenever HUBSPOT_ACCESS_TOKEN is
// absent or USE_MOCK_CRM=true.
import { randomUUID } from 'node:crypto';
import type { CrmAdapter, CrmContact, CrmActivity, CrmTask } from '../types';

export class MockCrmAdapter implements CrmAdapter {
  public readonly provider = 'mock';

  async upsertContact(contact: CrmContact): Promise<string> {
    return contact.crmId ?? `mock_contact_${randomUUID()}`;
  }

  async createActivity(_activity: CrmActivity): Promise<string> {
    return `mock_activity_${randomUUID()}`;
  }

  async createTask(_task: CrmTask): Promise<string> {
    return `mock_task_${randomUUID()}`;
  }
}
