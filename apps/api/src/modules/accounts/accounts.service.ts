// Accounts business logic: CRUD for company records. Every mutation writes an
// audit log entry. The `metadata` input maps to the metadataJson JSON column.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
  canWrite,
} from '../../utils/tenancy';
import type {
  ListAccountsInput,
  CreateAccountInput,
  UpdateAccountInput,
} from './accounts.schema';

export type { Actor };

export async function listAccounts(params: ListAccountsInput, actor: Actor) {
  const { page, limit, search, industry, enriched, ownerUserId } = params;

  const where: Prisma.AccountWhereInput = {
    // Accounts are company-scoped (shared across teams within the company).
    ...scopeWhere(actor),
    ...(industry ? { industry } : {}),
    ...(enriched !== undefined ? { enriched } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { domain: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.account.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getAccountById(id: string, actor: Actor) {
  const account = await prisma.account.findUnique({
    where: { id },
    include: { _count: { select: { contacts: true } } },
  });
  if (!account) throw Errors.notFound('Account not found');
  assertCanRead(actor, account);
  return account;
}

export async function createAccount(input: CreateAccountInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create accounts');
  const { metadata, ...rest } = input;
  const account = await prisma.account.create({
    data: {
      ...rest,
      companyId: actor.companyId,
      ...(metadata !== undefined
        ? { metadataJson: metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  await writeAuditLog({
    entityType: 'account',
    entityId: account.id,
    action: 'account.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created account ${account.name}`,
    ipAddress: actor.ipAddress,
  });

  return account;
}

export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
  actor: Actor,
) {
  const existing = await getAccountById(id, actor);
  assertCanWrite(actor, existing);

  const { metadata, ...rest } = input;
  const data: Prisma.AccountUpdateInput = { ...rest };
  if (metadata !== undefined) {
    data.metadataJson = metadata as Prisma.InputJsonValue;
  }

  const account = await prisma.account.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'account',
    entityId: account.id,
    action: 'account.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated account ${account.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return account;
}

export async function deleteAccount(id: string, actor: Actor) {
  const account = await getAccountById(id, actor);
  assertCanWrite(actor, account);

  // Contacts reference accounts with a nullable FK; block deletion while
  // contacts are still attached so we don't orphan records silently.
  if (account._count.contacts > 0) {
    throw Errors.conflict(
      `Account has ${account._count.contacts} contact(s); reassign or remove them first`,
    );
  }

  await prisma.account.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'account',
    entityId: id,
    action: 'account.delete',
    actorType: 'user',
    actorId: actor.id,
    summary: `Deleted account ${account.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
