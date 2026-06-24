// Companies (tenant) business logic. A user only ever sees/edits their own
// company. Company settings + billing are SUPER_ADMIN-only (enforced at route).
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import type { Actor } from '../../utils/tenancy';
import type {
  UpdateCompanyInput,
  ListCompaniesInput,
  CreateCompanyInput,
} from './companies.schema';

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

// ── Platform-owner cross-company operations ──────────────────────────────────
// These are gated to platform_owner at the route layer (requirePlatformOwner).

const companyCount = {
  _count: { select: { users: true, teams: true, campaigns: true, contacts: true } },
} satisfies Prisma.CompanyInclude;

export async function listCompanies(params: ListCompaniesInput) {
  const { page, limit, search } = params;
  const where: Prisma.CompanyWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: companyCount,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.company.count({ where }),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findUnique({ where: { id }, include: companyCount });
  if (!company) throw Errors.notFound('Company not found');
  return company;
}

export async function createCompany(input: CreateCompanyInput, actor: Actor) {
  const company = await prisma.company.create({
    data: {
      name: input.name,
      domain: input.domain ?? null,
      billingPlan: input.billingPlan ?? null,
      ...(input.salesFramework ? { salesFramework: input.salesFramework } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.settings ? { settingsJson: input.settings as Prisma.InputJsonValue } : {}),
    },
  });

  await writeAuditLog({
    entityType: 'company',
    entityId: company.id,
    action: 'company.create',
    actorType: 'user',
    actorId: actor.id,
    companyId: company.id,
    summary: `Platform owner created company ${company.name}`,
    ipAddress: actor.ipAddress,
  });

  return company;
}

export async function updateCompanyById(id: string, input: UpdateCompanyInput, actor: Actor) {
  await getCompanyById(id); // 404 if missing
  const data: Prisma.CompanyUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.domain !== undefined) data.domain = input.domain;
  if (input.billingPlan !== undefined) data.billingPlan = input.billingPlan;
  if (input.salesFramework !== undefined) data.salesFramework = input.salesFramework;
  if (input.settings !== undefined) data.settingsJson = input.settings as Prisma.InputJsonValue;

  const company = await prisma.company.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'company',
    entityId: id,
    action: 'company.update',
    actorType: 'user',
    actorId: actor.id,
    companyId: id,
    summary: `Platform owner updated company ${company.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return company;
}

// Hard-delete a company. Guarded: refuse while it still holds users/teams/
// campaigns/contacts so we never orphan or cascade-wipe live data by accident.
export async function deleteCompany(id: string, actor: Actor) {
  const company = await getCompanyById(id);
  const c = company._count;
  const blockers = [
    c.users && `${c.users} user(s)`,
    c.teams && `${c.teams} team(s)`,
    c.campaigns && `${c.campaigns} campaign(s)`,
    c.contacts && `${c.contacts} contact(s)`,
  ].filter(Boolean);
  if (blockers.length) {
    throw Errors.conflict(`Company still has ${blockers.join(', ')}; remove them before deleting`);
  }

  await prisma.company.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'company',
    entityId: id,
    action: 'company.delete',
    actorType: 'user',
    actorId: actor.id,
    companyId: id,
    summary: `Platform owner deleted company ${company.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
