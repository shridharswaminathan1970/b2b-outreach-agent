// Replies router. Mounted at /api/replies. All routes require authentication.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listRepliesSchema,
  replyIdParamSchema,
  ingestReplySchema,
  classifyReplySchema,
  handleReplySchema,
} from './replies.schema';
import {
  ingestReplyHandler,
  listRepliesHandler,
  getReplyHandler,
  classifyReplyHandler,
  handleReplyHandler,
} from './replies.controller';

const router = Router();

router.use(authenticate);

router.post('/', validate({ body: ingestReplySchema }), ingestReplyHandler);
router.get('/', validate({ query: listRepliesSchema }), listRepliesHandler);
router.get('/:id', validate({ params: replyIdParamSchema }), getReplyHandler);
router.post(
  '/:id/classify',
  validate({ params: replyIdParamSchema, body: classifyReplySchema }),
  classifyReplyHandler,
);
router.post(
  '/:id/handle',
  validate({ params: replyIdParamSchema, body: handleReplySchema }),
  handleReplyHandler,
);

export default router;
