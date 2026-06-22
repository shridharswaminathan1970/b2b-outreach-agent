// Per-company prompt overrides. The AI registry (packages/ai) prefers a
// company-specific active prompt for a purpose and falls back to the platform
// global default (companyId NULL). This module lets a SUPER_ADMIN manage their
// company's overrides; the seeded global defaults are read-only here. After any
// mutation the registry cache is cleared so changes apply immediately.
import { Prisma, prisma } from '@outreach/db';
import { clearPromptCache } from '@outreach/ai';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import type { Actor } from '../../utils/tenancy';
import type { ListPromptsInput, CreatePromptInput, UpdatePromptInput } from './prompts.schema';

// Annotate each row with whether it is the read-only global default.
function withFlags<T extends { companyId: string | null }>(row: T) {
  return { ...row, isGlobal: row.companyId === null };
}

export async function listPrompts(params: ListPromptsInput, actor: Actor) {
  const { page, limit, purpose, includeGlobal } = params;

  const tenantFilter: Prisma.PromptVersionWhereInput = includeGlobal
    ? { OR: [{ companyId: actor.companyId }, { companyId: null }] }
    : { companyId: actor.companyId };

  const where: Prisma.PromptVersionWhereInput = {
    ...tenantFilter,
    ...(purpose ? { purpose } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.promptVersion.findMany({
      where,
      orderBy: [{ purpose: 'asc' }, { version: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.promptVersion.count({ where }),
  ]);

  return {
    items: rows.map(withFlags),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPromptById(id: string, actor: Actor) {
  const prompt = await prisma.promptVersion.findUnique({ where: { id } });
  if (!prompt) throw Errors.notFound('Prompt not found');
  // Readable if it's the company's own override or a global default.
  if (prompt.companyId !== null && prompt.companyId !== actor.companyId) {
    throw Errors.notFound('Prompt not found');
  }
  return withFlags(prompt);
}

export async function createPrompt(input: CreatePromptInput, actor: Actor) {
  // Next version number for this company + purpose.
  const latest = await prisma.promptVersion.findFirst({
    where: { companyId: actor.companyId, purpose: input.purpose },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const prompt = await prisma.$transaction(async (tx) => {
    // Only one active override per (company, purpose): deactivate the others.
    if (input.isActive) {
      await tx.promptVersion.updateMany({
        where: { companyId: actor.companyId, purpose: input.purpose, isActive: true },
        data: { isActive: false },
      });
    }
    return tx.promptVersion.create({
      data: {
        companyId: actor.companyId,
        name: input.name,
        purpose: input.purpose,
        promptText: input.promptText,
        modelName: input.modelName,
        maxTokens: input.maxTokens,
        temperature: input.temperature != null ? new Prisma.Decimal(input.temperature) : null,
        version,
        isActive: input.isActive,
        createdBy: actor.id,
      },
    });
  });

  clearPromptCache();
  await writeAuditLog({
    entityType: 'prompt_version',
    entityId: prompt.id,
    action: 'prompt.create',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Created prompt override ${prompt.purpose} v${prompt.version}`,
    payload: { purpose: prompt.purpose, version: prompt.version, isActive: prompt.isActive },
    ipAddress: actor.ipAddress,
  });

  return withFlags(prompt);
}

// Load a company-owned (editable) prompt or throw. Globals are not editable here.
async function getOwnPrompt(id: string, actor: Actor) {
  const prompt = await prisma.promptVersion.findUnique({ where: { id } });
  if (!prompt || (prompt.companyId !== null && prompt.companyId !== actor.companyId)) {
    throw Errors.notFound('Prompt not found');
  }
  if (prompt.companyId === null) {
    throw Errors.forbidden('Global default prompts cannot be edited');
  }
  return prompt;
}

export async function updatePrompt(id: string, input: UpdatePromptInput, actor: Actor) {
  const existing = await getOwnPrompt(id, actor);

  const data: Prisma.PromptVersionUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.promptText !== undefined) data.promptText = input.promptText;
  if (input.modelName !== undefined) data.modelName = input.modelName;
  if (input.maxTokens !== undefined) data.maxTokens = input.maxTokens;
  if (input.temperature !== undefined) {
    data.temperature = input.temperature != null ? new Prisma.Decimal(input.temperature) : null;
  }

  const prompt = await prisma.$transaction(async (tx) => {
    // Activating this version deactivates the company's other versions for the
    // same purpose.
    if (input.isActive === true) {
      await tx.promptVersion.updateMany({
        where: {
          companyId: actor.companyId,
          purpose: existing.purpose,
          isActive: true,
          NOT: { id },
        },
        data: { isActive: false },
      });
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return tx.promptVersion.update({ where: { id }, data });
  });

  clearPromptCache();
  await writeAuditLog({
    entityType: 'prompt_version',
    entityId: id,
    action: 'prompt.update',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Updated prompt override ${prompt.purpose} v${prompt.version}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return withFlags(prompt);
}

export async function deletePrompt(id: string, actor: Actor) {
  const prompt = await getOwnPrompt(id, actor);

  await prisma.promptVersion.delete({ where: { id } });
  clearPromptCache();

  await writeAuditLog({
    entityType: 'prompt_version',
    entityId: id,
    action: 'prompt.delete',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Deleted prompt override ${prompt.purpose} v${prompt.version}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
