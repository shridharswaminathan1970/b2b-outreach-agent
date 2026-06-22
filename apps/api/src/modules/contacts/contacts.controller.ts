// HTTP handlers for the Contacts module, including the CSV/JSON import endpoint.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import type { Actor } from '../../utils/tenancy';
import * as contactsService from './contacts.service';
import { parseContactsCsv } from './contacts.import';
import {
  importContactsSchema,
  type ListContactsInput,
  type CreateContactInput,
  type UpdateContactInput,
  type UpdateStatusInput,
  type ImportContactRow,
  type EnrichContactsInput,
} from './contacts.schema';
import { z } from 'zod';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return {
    id: req.user.id,
    role: req.user.role,
    companyId: req.user.companyId,
    teamId: req.user.teamId,
    ipAddress: clientIp(req),
  };
}

export async function listContactsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListContactsInput;
    const result = await contactsService.listContacts(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getContactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const contact = await contactsService.getContactById(req.params.id, actorFrom(req));
    sendSuccess(res, { contact }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createContactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const contact = await contactsService.createContact(
      req.body as CreateContactInput,
      actorFrom(req),
    );
    sendSuccess(res, { contact }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateContactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const contact = await contactsService.updateContact(
      req.params.id,
      req.body as UpdateContactInput,
      actorFrom(req),
    );
    sendSuccess(res, { contact }, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateContactStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status } = req.body as UpdateStatusInput;
    const contact = await contactsService.updateContactStatus(
      req.params.id,
      status,
      actorFrom(req),
    );
    sendSuccess(res, { contact }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteContactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await contactsService.deleteContact(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

// Meta fields accepted alongside a multipart CSV upload.
const importMetaSchema = z.object({
  accountId: z.string().uuid().optional(),
  sourceFile: z.string().trim().max(255).optional(),
});

export async function importContactsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let rows: ImportContactRow[];
    let meta: { accountId?: string; sourceFile?: string };
    let parseSkipped = 0;

    if (req.file) {
      // multipart CSV path
      const parsed = parseContactsCsv(req.file.buffer);
      rows = parsed.rows;
      parseSkipped = parsed.skipped;
      const metaResult = importMetaSchema.safeParse(req.body);
      if (!metaResult.success) {
        throw Errors.badRequest('Invalid import metadata', metaResult.error.issues);
      }
      meta = {
        accountId: metaResult.data.accountId,
        sourceFile: metaResult.data.sourceFile ?? req.file.originalname,
      };
      if (rows.length === 0) {
        throw Errors.badRequest('No valid contact rows found in the uploaded file');
      }
    } else {
      // JSON path
      const result = importContactsSchema.safeParse(req.body);
      if (!result.success) {
        throw Errors.badRequest('Invalid import payload', result.error.issues);
      }
      rows = result.data.contacts;
      meta = { accountId: result.data.accountId, sourceFile: result.data.sourceFile };
    }

    const summary = await contactsService.importContacts(rows, meta, actorFrom(req));
    sendSuccess(res, { ...summary, skippedNoData: parseSkipped }, 201);
  } catch (err) {
    next(err);
  }
}

export async function enrichContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await contactsService.enrichContact(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function enrichContactsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactIds } = req.body as EnrichContactsInput;
    const summary = await contactsService.enrichContacts(contactIds, actorFrom(req));
    sendSuccess(res, summary, 200);
  } catch (err) {
    next(err);
  }
}
