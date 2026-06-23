# Deployment Runbook

The stack is three services — **api** (Express, port 3001), **worker** (pg-boss job
processor, health on 3002), **web** (Vite SPA served by nginx) — plus an **external
Supabase Postgres** (the job queue runs on that same Postgres via pg-boss; there is
**no** Redis and no local DB container).

Two supported deploy paths: **A) Docker Compose** on a single host, or
**B) Railway / Render** with one service per Dockerfile. Either way you must:
1. set the environment variables below,
2. run the DB migration once per release,
3. verify health + tracking reachability.

---

## 1. Environment variables

Copy `.env.example` → `.env` (Compose) or set these in the platform dashboard
(Railway/Render). **Required** unless noted.

### Core
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **pooled** URL (port 6543, `?pgbouncer=true`). Used at runtime. |
| `DIRECT_URL` | ✅ | Supabase **direct** URL (port 5432). Used by Prisma Migrate. |
| `JWT_SECRET` | ✅ | ≥16 chars. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | ✅ | ≥16 chars, different from above. |
| `NODE_ENV` | — | `production` (set by the Dockerfiles/compose). |
| `API_BASE_URL` | ▲ | The api's public URL. Must be real in prod (default is localhost). |
| `CORS_ALLOWED_ORIGINS` | ▲ | Comma-separated. **Must include the web's public origin** or the SPA's API calls are blocked. |

### AI (Anthropic)
| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ▲ | `sk-ant-…`. Without it the AI layer runs in mock mode. |

### Email sending — choose ONE transport
| Var | Notes |
|---|---|
| `USE_MOCK_EMAIL` | `false` to send for real (default `true` = safe mock). |
| **SMTP path** `SMTP_HOST/PORT/USER/PASS/FROM` | Sends via an existing mailbox (e.g. Gmail App Password). Takes precedence when `SMTP_USER` is set. No domain verification needed. |
| **Resend path** `RESEND_API_KEY` | Used when `SMTP_USER` is blank. Needs a Resend-verified domain. |
| `EMAIL_FROM_ADDRESS` | The From address. Must be on a verified/authenticated domain. |
| `EMAIL_VERIFIED_DOMAINS` | Comma-separated allowlist; the sender guard refuses any other (or placeholder) from-domain. |

### Email tracking (open pixel + unsubscribe + Resend webhook)
| Var | Notes |
|---|---|
| `PUBLIC_TRACKING_URL` | **Publicly reachable** origin email clients hit for the pixel/unsubscribe link. Set to the **web** public URL (nginx proxies `/t` + `/webhooks` to the api) or directly to the api's public URL. If unset it falls back to `API_BASE_URL` — pointing at localhost in prod means pixels/links won't resolve. |
| `TRACKING_SECRET` | Optional; signs tracking tokens. Falls back to `JWT_SECRET`. |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from the Resend dashboard. Only needed if sending via Resend (Gmail SMTP has no event webhooks). |

### Enrichment / CRM (optional)
`APOLLO_API_KEY` (+ `USE_MOCK_ENRICHMENT=false`) for prospecting/enrich; leave
`USE_MOCK_CRM=true` (HubSpot is behind the mock flag, not yet wired).

### Worker cadence (have defaults)
`FOLLOWUP_CRON` (`*/10 * * * *`), `REPLY_CHECK_CRON` (`*/5 * * * *`).

> ⚠️ Booleans use real parsing — only `true/1/yes/on` are true. `USE_MOCK_EMAIL=False`
> correctly means "not mock". (Don't rely on `z.coerce.boolean`-style truthiness.)

---

## 2A. Deploy with Docker Compose (single host)

Host needs Docker + a filled-in root `.env`.

```bash
# one-time + every release: apply migrations against Supabase
./scripts/db-migrate.sh          # = prisma migrate deploy

# build + start (prod overrides: api/worker internal-only, web on :80)
./scripts/deploy.sh
# or directly:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

In prod-compose, **web (nginx) is the only public entry**. It proxies `/api/`,
`/t/`, and `/webhooks/` to the api container, so set:
- `CORS_ALLOWED_ORIGINS=https://your-web-host`
- `PUBLIC_TRACKING_URL=https://your-web-host`

## 2B. Deploy on Railway / Render (per-service)

Create **three services** from the repo, each pointing at its Dockerfile:
`apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/web/Dockerfile`.

- Set the env vars (section 1) on **api** and **worker** (web needs none at
  runtime — it's static; the SPA calls the api via its configured origin).
- **Release / pre-deploy command** (api service): `./scripts/db-migrate.sh`
  (or `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`).
- Each service gets its own public URL. Then:
  - `API_BASE_URL` = the api service URL
  - `CORS_ALLOWED_ORIGINS` = the web service URL
  - `PUBLIC_TRACKING_URL` = the **api** service URL (mail clients hit the api
    directly; nginx isn't in the path here)
- Health checks: api `GET /health` (3001), worker `GET /health` (3002).

---

## 3. Post-deploy verification

```bash
# health
curl -s https://<api-or-web>/health            # {"status":"ok","db":"connected"}
curl -s https://<worker-host>/health           # worker (if exposed)

# tracking ingress is public (no auth) — pixel returns a gif even for a bad token
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<public>/t/o/x.gif
# → 200 image/gif
```

- Log in through the web origin; confirm the dashboard loads (CORS correct).
- Send a test email to `delivered@resend.dev` from a verified from-address;
  confirm `provider` is `smtp`/`resend` (not `mock`).
- If on Resend: add the webhook `https://<public>/webhooks/resend` in the Resend
  dashboard and set `RESEND_WEBHOOK_SECRET`.

---

## 4. Gotchas / checklist

- [ ] `DATABASE_URL` pooled (6543), `DIRECT_URL` direct (5432) — Migrate fails on the pooler.
- [ ] `CORS_ALLOWED_ORIGINS` includes the web origin (else login fails silently in the browser).
- [ ] `PUBLIC_TRACKING_URL` is a real public origin, not localhost (else open pixels / unsubscribe links break in delivered email).
- [ ] From-domain is verified with the transport and listed in `EMAIL_VERIFIED_DOMAINS` (the send guard blocks placeholders/unverified domains).
- [ ] Migration run as a release step on every deploy (`prisma migrate deploy` is idempotent).
- [ ] Secrets are injected at runtime (never baked into images — `.dockerignore` excludes `.env`).
