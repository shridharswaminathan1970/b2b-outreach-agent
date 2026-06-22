// Messages router. Mounted at /api/messages. All routes require authentication.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listMessagesSchema,
  messageIdParamSchema,
  sendMessageSchema,
  recordEventSchema,
} from './messages.schema';
import {
  sendMessageHandler,
  listMessagesHandler,
  getMessageHandler,
  getMessageStatusHandler,
  recordEventHandler,
} from './messages.controller';

const router = Router();

router.use(authenticate);

router.post('/send', validate({ body: sendMessageSchema }), sendMessageHandler);
router.get('/', validate({ query: listMessagesSchema }), listMessagesHandler);
router.get('/:id', validate({ params: messageIdParamSchema }), getMessageHandler);
router.get(
  '/:id/status',
  validate({ params: messageIdParamSchema }),
  getMessageStatusHandler,
);
router.post(
  '/:id/events',
  validate({ params: messageIdParamSchema, body: recordEventSchema }),
  recordEventHandler,
);

export default router;
