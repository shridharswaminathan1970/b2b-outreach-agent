// Express application setup: security middleware, body parsing, rate limiting,
// route mounting, health check, and the global error handler (registered last).
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config';
import { prisma } from './config/database';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import { sendSuccess } from './utils/response';
import authRoutes from './modules/auth/auth.routes';
import companiesRoutes from './modules/companies/companies.routes';
import teamsRoutes from './modules/teams/teams.routes';
import usersRoutes from './modules/users/users.routes';
import accountsRoutes from './modules/accounts/accounts.routes';
import contactsRoutes from './modules/contacts/contacts.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import opportunitiesRoutes from './modules/opportunities/opportunities.routes';
import sequencesRoutes from './modules/sequences/sequences.routes';
import prospectingRoutes from './modules/prospecting/prospecting.routes';
import templatesRoutes from './modules/templates/templates.routes';
import promptsRoutes from './modules/prompts/prompts.routes';
import draftsRoutes from './modules/drafts/drafts.routes';
import messagesRoutes from './modules/messages/messages.routes';
import repliesRoutes from './modules/replies/replies.routes';
import suppressionRoutes from './modules/suppression/suppression.routes';
import auditRoutes from './modules/audit/audit.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import webhooksRoutes from './modules/webhooks/webhooks.routes';

export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop so req.ip / rate-limit keys are accurate behind
  // a load balancer (Railway/Render).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Liveness + lightweight DB readiness probe. Always 200 if the process is up;
  // reports DB connectivity without failing the check.
  app.get('/health', async (_req: Request, res: Response) => {
    let db = 'unknown';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {
      db = 'disconnected';
    }
    sendSuccess(res, { status: 'ok', service: 'api', db, uptime: process.uptime() });
  });

  // Global rate limiter applies to the API surface (not the health check).
  app.use('/api', globalRateLimiter);

  // Module routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/companies', companiesRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/accounts', accountsRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/prospecting', prospectingRoutes);
  app.use('/api/campaigns', campaignsRoutes);
  app.use('/api/opportunities', opportunitiesRoutes);
  app.use('/api/sequences', sequencesRoutes);
  app.use('/api/templates', templatesRoutes);
  app.use('/api/prompts', promptsRoutes);
  app.use('/api/drafts', draftsRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/replies', repliesRoutes);
  app.use('/api/suppression', suppressionRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/webhooks', webhooksRoutes);

  // 404 + error handler must be registered last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
