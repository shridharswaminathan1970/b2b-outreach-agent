// Templates business logic: CRUD plus a render preview. The `variables` column
// is auto-derived from the subject/body on every write so it always reflects
// the actual placeholders in the template.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { extractVariables, renderTemplate } from './templates.render';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
  canWrite,
} from '../../utils/tenancy';
import type {
  ListTemplatesInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  PreviewTemplateInput,
} from './templates.schema';

export type { Actor };

export async function listTemplates(params: ListTemplatesInput, actor: Actor) {
  const { page, limit, search, persona, campaignType } = params;

  const where: Prisma.TemplateWhereInput = {
    // Templates are company-scoped (shared across teams within the company).
    ...scopeWhere(actor),
    ...(persona ? { persona } : {}),
    ...(campaignType ? { campaignType } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.template.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getTemplateById(id: string, actor: Actor) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw Errors.notFound('Template not found');
  assertCanRead(actor, template);
  return template;
}

export async function createTemplate(input: CreateTemplateInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create templates');
  const variables = extractVariables(input.subjectTemplate, input.bodyTemplate);

  const template = await prisma.template.create({
    data: { ...input, variables, createdBy: actor.id, companyId: actor.companyId },
  });

  await writeAuditLog({
    entityType: 'template',
    entityId: template.id,
    action: 'template.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created template ${template.name}`,
    payload: { variables },
    ipAddress: actor.ipAddress,
  });

  return template;
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
  actor: Actor,
) {
  const current = await getTemplateById(id, actor);
  assertCanWrite(actor, current);

  const data: Prisma.TemplateUpdateInput = { ...input };

  // Recompute variables if either template body part is being changed.
  if (input.subjectTemplate !== undefined || input.bodyTemplate !== undefined) {
    const subject =
      input.subjectTemplate !== undefined
        ? input.subjectTemplate
        : current.subjectTemplate;
    const body =
      input.bodyTemplate !== undefined ? input.bodyTemplate : current.bodyTemplate;
    data.variables = extractVariables(subject, body);
  }

  const template = await prisma.template.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'template',
    entityId: template.id,
    action: 'template.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated template ${template.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return template;
}

export async function deleteTemplate(id: string, actor: Actor) {
  const template = await getTemplateById(id, actor);
  assertCanWrite(actor, template);

  // Block deletion while referenced by sequence steps.
  const inUse = await prisma.sequenceStep.count({ where: { templateId: id } });
  if (inUse > 0) {
    throw Errors.conflict(
      `Template is used by ${inUse} sequence step(s); detach them first`,
    );
  }

  await prisma.template.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'template',
    entityId: id,
    action: 'template.delete',
    actorType: 'user',
    actorId: actor.id,
    summary: `Deleted template ${template.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}

// Render a saved template against sample data, reporting any unresolved
// variables so the UI can warn before sending.
export async function previewTemplate(id: string, input: PreviewTemplateInput, actor: Actor) {
  const template = await getTemplateById(id, actor);

  const subject = renderTemplate(template.subjectTemplate, input.sampleData);
  const body = renderTemplate(template.bodyTemplate, input.sampleData);

  const missing = [...new Set([...subject.missing, ...body.missing])];

  return {
    subject: subject.output,
    body: body.output,
    variables: template.variables,
    missing,
    complete: missing.length === 0,
  };
}
