// Companies (tenant) business logic. A user only ever sees/edits their own
// company. Company settings + billing are SUPER_ADMIN-only (enforced at route).
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import type { Actor } from '../../utils/tenancy';
import type { UpdateCompanyInput } from './companies.schema';

export async function getMyCompany(actor: Actor) {
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    include: { _count: { select: { users: true, teams: true } } },
  });
  if (!company) throw Errors.notFound('Company not found');
  return company;
}

export async function updateMyCompany(input: UpdateCompanyInput, actor: Actor) {
  const data: Prisma.CompanyUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.domain !== undefined) data.domain = input.domain;
  if (input.billingPlan !== undefined) data.billingPlan = input.billingPlan;
  if (input.salesFramework !== undefined) data.salesFramework = input.salesFramework;
  if (input.settings !== undefined) {
    data.settingsJson = input.settings as Prisma.InputJsonValue;
  }

  const company = await prisma.company.update({ where: { id: actor.companyId }, data });

  await writeAuditLog({
    entityType: 'company',
    entityId: company.id,
    action: 'company.update',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Updated company settings: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return company;
}
