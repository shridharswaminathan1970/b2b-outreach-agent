// Zod schemas for the Contacts module.
import { z } from 'zod';

// Lifecycle status for a contact. Transitions are not strictly enforced here;
// the set is the allowed vocabulary for create/update/status endpoints.
export const contactStatusEnum = z.enum([
  'new',
  'enriching',
  'enriched',
  'scored',
  'ready',
  'contacted',
  'engaged',
  'replied',
  'bounced',
  'unqualified',
  'suppressed',
]);

export const listContactsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: contactStatusEnum.optional(),
  accountId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  enriched: z.coerce.boolean().optional(),
  suppressed: z.coerce.boolean().optional(),
});

export const contactIdParamSchema = z.object({
  id: z.string().uuid('A valid contact id is required'),
});

export const createContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    firstName: z.string().trim().max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    email: z.string().email().toLowerCase().optional(),
    phone: z.string().trim().max(50).optional(),
    title: z.string().trim().max(150).optional(),
    seniority: z.string().trim().max(50).optional(),
    department: z.string().trim().max(100).optional(),
    linkedinUrl: z.string().url().optional(),
    location: z.string().trim().max(150).optional(),
    timezone: z.string().trim().max(60).optional(),
    accountId: z.string().uuid().optional(),
    ownerUserId: z.string().uuid().optional(),
    status: contactStatusEnum.optional(),
    source: z.string().trim().max(100).optional(),
    // External cross-reference (e.g. IGNITE-APEX CRM record).
    externalSource: z.string().trim().max(100).optional(),
    externalId: z.string().trim().max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  // A contact must be addressable by at least a name or an email.
  .refine((d) => Boolean(d.name || d.firstName || d.lastName || d.email), {
    message: 'Provide at least a name or an email',
  });

export const updateContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    firstName: z.string().trim().max(120).nullable().optional(),
    lastName: z.string().trim().max(120).nullable().optional(),
    email: z.string().email().toLowerCase().nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    title: z.string().trim().max(150).nullable().optional(),
    seniority: z.string().trim().max(50).nullable().optional(),
    department: z.string().trim().max(100).nullable().optional(),
    linkedinUrl: z.string().url().nullable().optional(),
    location: z.string().trim().max(150).nullable().optional(),
    timezone: z.string().trim().max(60).nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    status: contactStatusEnum.optional(),
    icpScore: z.coerce.number().int().min(0).max(100).optional(),
    enriched: z.coerce.boolean().optional(),
    validated: z.coerce.boolean().optional(),
    externalSource: z.string().trim().max(100).nullable().optional(),
    externalId: z.string().trim().max(200).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export const updateStatusSchema = z.object({
  status: contactStatusEnum,
});

// POST /contacts/import — JSON fallback (the multipart CSV path parses to the
// same shape before calling the service).
export const importContactsSchema = z.object({
  accountId: z.string().uuid().optional(),
  sourceFile: z.string().trim().max(255).optional(),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().max(200).optional(),
        firstName: z.string().trim().max(120).optional(),
        lastName: z.string().trim().max(120).optional(),
        email: z.string().email().toLowerCase().optional(),
        phone: z.string().trim().max(50).optional(),
        title: z.string().trim().max(150).optional(),
        company: z.string().trim().max(200).optional(),
        linkedinUrl: z.string().url().optional(),
      }),
    )
    .min(1, 'Provide at least one contact')
    .max(5000),
});

// POST /contacts/enrich — bulk enrich a set of contacts.
export const enrichContactsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, 'Select at least one contact').max(200),
});

export type EnrichContactsInput = z.infer<typeof enrichContactsSchema>;
export type ListContactsInput = z.infer<typeof listContactsSchema>;
export type ContactIdParam = z.infer<typeof contactIdParamSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type ImportContactRow = ImportContactsInput['contacts'][number];
