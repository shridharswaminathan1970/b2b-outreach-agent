# API service image. Built from the monorepo root so npm workspaces + the shared
# packages (@outreach/db, @outreach/ai, @outreach/integrations) resolve.
#
# The workspace packages export TypeScript SOURCE (package main = src/index.ts),
# so a plain `tsc` build leaves require("@outreach/...") pointing at .ts files
# node can't load. The build step bundles with esbuild (scripts/bundle.mjs),
# inlining the workspace packages into a single self-contained dist/server.js
# while keeping npm deps external — then we run the compiled JS with node.
FROM node:20-slim

# Prisma needs openssl + CA certs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all workspace dependencies (lockfile-exact). devDependencies are
# installed because NODE_ENV is not yet 'production' here — tsc + esbuild are
# needed for the build step below.
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
COPY scripts ./scripts
RUN npm ci

# Generate the Prisma client for this platform.
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

# Typecheck + bundle to a runnable dist/server.js.
RUN npm run build --workspace=apps/api

ENV NODE_ENV=production
EXPOSE 3001

# Run the compiled bundle. Config reads connection + secrets from the injected
# environment (no .env file needed in the container).
CMD ["node", "apps/api/dist/server.js"]
