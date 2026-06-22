# Web image: build the Vite SPA, then serve the static bundle via nginx (which
# also reverse-proxies /api to the API service).

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm ci

RUN npm run build --workspace=apps/web

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
