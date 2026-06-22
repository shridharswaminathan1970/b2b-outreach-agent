// Contacts router. Mounted at /api/contacts. All routes require authentication.
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listContactsSchema,
  contactIdParamSchema,
  createContactSchema,
  updateContactSchema,
  updateStatusSchema,
  enrichContactsSchema,
} from './contacts.schema';
import {
  listContactsHandler,
  getContactHandler,
  createContactHandler,
  updateContactHandler,
  updateContactStatusHandler,
  deleteContactHandler,
  importContactsHandler,
  enrichContactHandler,
  enrichContactsHandler,
} from './contacts.controller';

// CSV files are parsed in-memory (no disk persistence), capped at 10 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);

// Import accepts either a multipart CSV (field name "file") or a JSON body.
router.post('/import', upload.single('file'), importContactsHandler);

// Enrichment (write-gated). Bulk route registered before /:id/* for clarity.
router.post('/enrich', requireWrite, validate({ body: enrichContactsSchema }), enrichContactsHandler);
router.post(
  '/:id/enrich',
  requireWrite,
  validate({ params: contactIdParamSchema }),
  enrichContactHandler,
);

router.get('/', validate({ query: listContactsSchema }), listContactsHandler);
router.get('/:id', validate({ params: contactIdParamSchema }), getContactHandler);
router.post('/', validate({ body: createContactSchema }), createContactHandler);
router.patch(
  '/:id',
  validate({ params: contactIdParamSchema, body: updateContactSchema }),
  updateContactHandler,
);
router.patch(
  '/:id/status',
  validate({ params: contactIdParamSchema, body: updateStatusSchema }),
  updateContactStatusHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: contactIdParamSchema }),
  deleteContactHandler,
);

export default router;
