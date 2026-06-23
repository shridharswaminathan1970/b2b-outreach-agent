// Loads and validates all environment variables the API depends on.
// Fails fast at startup if a required variable is missing or malformed.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Walk up from the current working directory to find the monorepo root .env.
// (npm workspaces run with cwd = package dir, but the single .env lives at the repo root.)
function loadEnvFile(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config(); // fallback to default resolution
}

loadEnvFile();

// Parse a boolean from an env string. NOTE: z.coerce.boolean() is WRONG for env
// vars — it does Boolean(string), so "false"/"False"/"0" all become true. This
// only treats explicit truthy tokens as true.
const envBool = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return def;
    return ['true', '1', 'yes', 'on'].includes(String(v).trim().toLowerCase());
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'debug'])
    .default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),

  // Email / provider settings. When USE_MOCK_EMAIL is true (or no Resend key is
  // set) the system sends through the mock provider instead of a real API.
  EMAIL_FROM_ADDRESS: z.string().email().default('outreach@example.com'),
  EMAIL_FROM_NAME: z.string().default('Outreach'),
  EMAIL_REPLY_TO: z.string().email().optional(),
  // Comma-separated list of domains verified with the email provider that the
  // from-address is allowed to use. When set, a live send from any other domain
  // is refused (safe-by-default). Leave empty in dev; required for real sends.
  EMAIL_VERIFIED_DOMAINS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Inbound-tracking: token signing secret + the public URL email clients reach.
  TRACKING_SECRET: z.string().optional(),
  PUBLIC_TRACKING_URL: z.string().url().optional(),
  // Svix signing secret for the Resend inbound webhook (whsec_...).
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  USE_MOCK_EMAIL: envBool(true),
  USE_MOCK_ENRICHMENT: envBool(true),
  USE_MOCK_CRM: envBool(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print which variables failed (names only — never values) and exit.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.API_PORT,
  baseUrl: env.API_BASE_URL,
  // Allowed browser origins. Trailing slashes are stripped so a value like
  // "https://app.example.com/" still matches the browser's slash-less Origin.
  corsOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  jwt: {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  bcryptRounds: env.BCRYPT_ROUNDS,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
  },
  log: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
  email: {
    fromAddress: env.EMAIL_FROM_ADDRESS,
    fromName: env.EMAIL_FROM_NAME,
    replyTo: env.EMAIL_REPLY_TO,
    // Use the mock provider when explicitly enabled or when no API key exists.
    useMock: env.USE_MOCK_EMAIL || !env.RESEND_API_KEY,
    verifiedDomains: (env.EMAIL_VERIFIED_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  },
  features: {
    mockEmail: env.USE_MOCK_EMAIL,
    mockEnrichment: env.USE_MOCK_ENRICHMENT,
    mockCrm: env.USE_MOCK_CRM,
  },
  tracking: {
    // Secret for signing open-pixel / unsubscribe tokens. Falls back to the JWT
    // secret so tracking works without extra config.
    secret: env.TRACKING_SECRET || env.JWT_SECRET,
    // Public base URL email clients hit for the pixel / unsubscribe link. In
    // production set this to the deployed API origin.
    publicUrl: env.PUBLIC_TRACKING_URL || env.API_BASE_URL,
  },
  resendWebhookSecret: env.RESEND_WEBHOOK_SECRET || '',
} as const;

export type AppConfig = typeof config;
