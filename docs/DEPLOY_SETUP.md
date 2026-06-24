# Deploy setup — outstanding ops items

Three things still need to be done in your hosting/dashboard for the deployed
app to be fully live. None are code; they need your Railway dashboard and a
one-line command.

---

## 1. Set live Claude on the deployed services

Your new `ANTHROPIC_API_KEY` is verified working **locally**. The deployed API
and worker on Railway won't use live Claude until the same key is in their
environment.

In the **Railway** project, for **both** the `api` and `worker` services →
**Variables** → add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-…` (the same key now in your local `.env`) |

Without it, those services fall back to mock copy (empty key) or error (a bad
key). Optional model overrides (`ANTHROPIC_MODEL_DRAFT`, etc.) are not required —
the defaults are correct.

---

## 2. Point provisioning links at the deployed web URL

The self-serve onboarding emails a set-password link built from `WEB_APP_URL`.
It defaults to `http://localhost:3000`, which is dead in production.

In the **api** service → **Variables**:

| Variable | Value |
|---|---|
| `WEB_APP_URL` | Your deployed web URL, e.g. `https://app.yourdomain.com` (no trailing slash) |

After setting it, re-trigger an approval and the reset link will be correct.

---

## 3. Bootstrap the real platform owner

The single cross-company `platform_owner` (muhammad.shaamel@gmail.com) must
exist before anyone can log into `/platform` to approve signup requests.

The bootstrap script connects to whatever `DATABASE_URL` is in `.env`. Since this
project uses one shared Supabase database for local + prod, **run it once from
your machine** — it writes straight to the production DB:

```bash
PLATFORM_OWNER_EMAIL=muhammad.shaamel@gmail.com \
PLATFORM_OWNER_PASSWORD='<choose-a-strong-password>' \
npx tsx scripts/create-platform-owner.ts
```

It's idempotent (safe to re-run; re-running resets the password). It creates a
dedicated "Platform" company to hold the account and prints
`✓ platform_owner ready: …`.

Then log in at `/login` with that email/password and you'll land on the
**Platform** console.

> If your deployed services ever point at a **different** database than your
> local `.env`, run the command with that DB's `DATABASE_URL`/`DIRECT_URL`
> exported instead, or run it from the Railway shell.

---

## Quick verification after all three

1. **Live AI**: trigger a draft (or enroll a contact) on the deployed app → the
   generated draft should read like real copy, not the templated mock.
2. **Provisioning**: submit `/signup` → approve in `/platform` → the emailed
   link should be `https://<your-web-url>/reset-password?token=…`.
3. **Platform login**: sign in as the platform owner and confirm the Platform
   console lists requests.
