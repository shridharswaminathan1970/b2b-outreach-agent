// Zod schemas for the Audit module (read/query/export only — audit logs are
// append-only, so there are no create/update/delete schemas here).
import { z } from 'zod';

// Shared filter fields for both the paginated query and the CSV export.
const auditFilters = {
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  actorType: z.enum(['user', 'system', 'worker']).optional(),
  actorId: z.string().uuid().optional(),
  // Inclusive lower / exclusive upper bound on created_at.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  ...auditFilters,
});

// Export applies the same filters but streams up to `limit` rows as CSV.
export const exportAuditLogsSchema = z.object({
  limit: z.coerce.number().int().positive().max(50000).default(5000),
  ...auditFilters,
});

export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
export type ExportAuditLogsInput = z.infer<typeof exportAuditLogsSchema>;
