# Worker service image. Runs the pg-boss job processor (no Redis — the queue runs
# on the same Supabase Postgres). Same monorepo build approach as the API: the
# workspace packages ship TypeScript source, so the build step bundles with
# esbuild (scripts/bundle.mjs) into a self-contained dist/index.js, then node runs
# the compiled JS.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# devDependencies (tsc + esbuild) are needed for the build — installed because
# NODE_ENV is not yet 'production' at npm ci time.
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
COPY scripts ./scripts
RUN npm ci

RUN npx prisma generate --schema packages/db/prisma/schema.prisma

# Typecheck + bundle to a runnable dist/index.js.
RUN npm run build --workspace=apps/worker

ENV NODE_ENV=production
# Health server port (GET /health).
EXPOSE 3002

# Run the compiled bundle.
CMD ["node", "apps/worker/dist/index.js"]
