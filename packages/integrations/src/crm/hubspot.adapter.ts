// HubSpot CRM adapter (live). Selected by the factory only when a real
// HUBSPOT_ACCESS_TOKEN is present. Uses the CRM v3 objects API (private-app token).
import axios, { type AxiosInstance } from 'axios';
import { integrationsConfig } from '../config';
import type { CrmAdapter, CrmContact, CrmActivity, CrmTask } from '../types';

export class HubspotCrmAdapter implements CrmAdapter {
  public readonly provider = 'hubspot';

  private http: AxiosInstance;

  constructor(token: string = integrationsConfig.crm.hubspotToken) {
    this.http = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  // Upsert by email: try create, fall back to update when the contact exists.
  async upsertContact(contact: CrmContact): Promise<string> {
    const properties = {
      email: contact.email ?? undefined,
      firstname: contact.firstName ?? undefined,
      lastname: contact.lastName ?? undefined,
      company: contact.company ?? undefined,
      jobtitle: contact.title ?? undefined,
    };

    if (contact.crmId) {
      await this.http.patch(`/crm/v3/objects/contacts/${contact.crmId}`, { properties });
      return contact.crmId;
    }

    try {
      const { data } = await this.http.post('/crm/v3/objects/contacts', { properties });
      return String(data.id);
    } catch (err) {
      // 409 = already exists; update via the email-keyed endpoint.
      if (axios.isAxiosError(err) && err.response?.status === 409 && contact.email) {
        const { data } = await this.http.patch(
          `/crm/v3/objects/contacts/${encodeURIComponent(contact.email)}?idProperty=email`,
          { properties },
        );
        return String(data.id);
      }
      throw err;
    }
  }

  async createActivity(activity: CrmActivity): Promise<string> {
    // Model activities as Notes associated to the contact.
    const { data } = await this.http.post('/crm/v3/objects/notes', {
      properties: {
        hs_note_body: `[${activity.type}] ${activity.subject ?? ''}\n${activity.body ?? ''}`.trim(),
        hs_timestamp: (activity.occurredAt ?? new Date()).toISOString(),
      },
      associations: [
        {
          to: { id: activity.crmContactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        },
      ],
    });
    return String(data.id);
  }

  async createTask(task: CrmTask): Promise<string> {
    const { data } = await this.http.post('/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: task.title,
        hs_task_body: task.notes ?? '',
        hs_timestamp: (task.dueAt ?? new Date()).toISOString(),
        hs_task_status: 'NOT_STARTED',
      },
      associations: [
        {
          to: { id: task.crmContactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
        },
      ],
    });
    return String(data.id);
  }
}
