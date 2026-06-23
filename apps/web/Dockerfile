# Web image: build the Vite SPA, then serve the static bundle via nginx (which
# also reverse-proxies /api to the API service).

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Absolute API origin baked into the SPA at build time. On Railway the web and api
# are separate services, so the SPA calls the api's public URL directly. Override
# per environment with --build-arg VITE_API_URL=... (e.g. empty for local compose,
# which then uses the same-origin /api nginx proxy instead).
ARG VITE_API_URL=https://outreachapi-production-2411.up.railway.app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm ci

# Vite only inlines VITE_* vars from its env files — write one so the build picks
# up VITE_API_URL (loaded automatically in production mode).
RUN printf 'VITE_API_URL=%s\n' "$VITE_API_URL" > apps/web/.env.production
RUN npm run build --workspace=apps/web

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine
# Provide a template (not a final conf): the nginx image entrypoint runs envsubst
# over /etc/nginx/templates/*.template → /etc/nginx/conf.d/ at startup. PORT has a
# default of 80 (local/compose); Railway overrides it with its dynamic port.
# NGINX_ENVSUBST_FILTER restricts substitution to PORT only, so nginx runtime
# variables ($host, $scheme, $uri, …) in the config are left intact.
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER=^PORT$
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
