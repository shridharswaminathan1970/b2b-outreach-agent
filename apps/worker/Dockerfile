# Worker service image. Runs the pg-boss job processor (no Redis — the queue runs
# on the same Supabase Postgres). Same monorepo build approach as the API.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm ci

RUN npx prisma generate --schema packages/db/prisma/schema.prisma

ENV NODE_ENV=production
# Health server port (GET /health).
EXPOSE 3002

CMD ["npx", "tsx", "apps/worker/src/index.ts"]
