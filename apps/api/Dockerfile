# API service image. Built from the monorepo root so npm workspaces + the shared
# packages (@outreach/db, @outreach/ai, @outreach/integrations) resolve. Runs the
# TypeScript directly with tsx (the workspace packages export TS source), so no
# separate compile step is needed.
FROM node:20-slim

# Prisma needs openssl + CA certs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all workspace dependencies (lockfile-exact).
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm ci

# Generate the Prisma client for this platform.
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3001

# Config reads connection + secrets from the injected environment (no .env file
# needed in the container).
CMD ["npx", "tsx", "apps/api/src/server.ts"]
