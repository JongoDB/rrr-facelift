# 13 — Secrets & Environment Manifest

> Every credential and config value the system needs. Update this file whenever a new env var is introduced.

## Storage Locations

| Location | What goes there | Who can write |
|----------|------------------|---------------|
| **Workers Secrets** (`wrangler secret put`) | Runtime secrets used by `apps/api/` | Owner via `wrangler` CLI |
| **Pages Environment Variables** (Cloudflare dashboard) | Build-time config for `apps/web/` and `apps/tech-pwa/` | Owner |
| **n8n Credentials** (`flows.triple-r-rv.com/credentials`) | Secrets used in n8n workflows | Owner via n8n UI |
| **GitHub Secrets** (repo Settings → Secrets) | CI/CD secrets (deploy tokens) | Owner |
| **`.env.local`** (gitignored) | Local-dev only | Anyone with repo access |
| **`.env.example`** (committed) | Placeholder template, no real values | Anyone |
| **VM environment** (`/etc/rrr/.env`, owner-managed) | Docker Compose runtime vars | Owner |

## Manifest

### Cloudflare

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | GH Secrets, Workers env, local `.env` | Owner | wrangler CLI, CI | Not secret per se, but env-specific |
| `CLOUDFLARE_API_TOKEN` | GH Secrets, owner local | Owner | CI deploys | Scope: Pages Edit, Workers Edit, DNS Edit, Tunnels Edit |
| `CLOUDFLARE_TUNNEL_TOKEN` | VM env, n8n credential | Owner (after `cloudflared tunnel create`) | `cloudflared` Docker container | Long string, treat as secret |

### Anthropic

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `ANTHROPIC_API_KEY` | Workers Secrets, n8n credential | Owner (from console.anthropic.com) | API Worker (`/agent/*`), n8n (intake classifier) | Single key; if rotation needed, update both places |

### Zoho Books

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `ZOHO_CLIENT_ID` | Workers Secrets, n8n credential | Owner (Self Client in Zoho API Console) | API Worker, n8n | |
| `ZOHO_CLIENT_SECRET` | Workers Secrets, n8n credential | Owner | API Worker, n8n | |
| `ZOHO_REFRESH_TOKEN` | Workers Secrets, n8n credential | Owner (one-time exchange of auth code) | API Worker, n8n | Long-lived; only invalidate by revoking in Zoho |
| `ZOHO_ORG_ID` | Workers env (var, not secret) | Owner | API Worker, n8n | Visible in Zoho Books URL |
| `ZOHO_REGION` | Workers env (var) | Owner | API Worker, n8n | `com` for US (default), `eu`, `in`, etc. |
| `ZOHO_WEBHOOK_SECRET` | n8n credential | Owner (set when configuring webhooks in Zoho) | n8n inbound `/webhook/zoho/*` | HMAC signing key |

### Twilio

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `TWILIO_ACCOUNT_SID` | n8n credential, Workers Secrets | Owner | n8n SMS workflows, API Worker (if direct SMS needed) | |
| `TWILIO_AUTH_TOKEN` | n8n credential, Workers Secrets | Owner | Same | |
| `TWILIO_FROM_NUMBER` | n8n env (var), Workers env | Owner | Same | E.164 format, e.g., `+17045551234` |

### Resend (Email)

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `RESEND_API_KEY` | Workers Secrets, n8n credential | Owner (from resend.com) | API Worker (magic links), n8n (customer emails) | |
| `RESEND_FROM_EMAIL` | Workers env, n8n env | Owner | Same | e.g., `noreply@triple-r-rv.com` (verified domain) |
| `RESEND_REPLY_TO_EMAIL` | Workers env, n8n env | Owner | Same | e.g., `info@triple-r-rv.com` (Google Workspace) |

### Application

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `JWT_SECRET` | Workers Secrets | Owner (random 64-byte hex) | API Worker auth | `openssl rand -hex 32` |
| `APP_URL` | Workers env | Owner | API Worker (magic link URLs) | `https://app.triple-r-rv.com` |
| `WEB_URL` | Workers env | Owner | API Worker (CORS, links) | `https://triple-r-rv.com` |
| `API_URL` | Pages build env | Owner | Web + PWA build | `https://api.triple-r-rv.com` |
| `SHOP_ADDRESS` | Workers env, n8n env | Owner | Mileage calc | Full address string |
| `SHOP_LATITUDE` | Workers env | Owner | Mileage calc (geocoded once) | Faster than re-geocoding origin |
| `SHOP_LONGITUDE` | Workers env | Owner | Same | |
| `OWNER_EMAIL` | Workers env, n8n env | Owner | Alerts, magic-link recipients | |
| `OWNER_PHONE` | n8n env | Owner | Tech SMS recipient | E.164 |
| `AUTHORIZED_TECH_EMAILS` | Workers env (comma-separated) | Owner | API Worker auth | Initially: just `OWNER_EMAIL` |

### Postgres / VM

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `POSTGRES_USER` | VM `.env` | Owner | docker-compose | |
| `POSTGRES_PASSWORD` | VM `.env` | Owner (strong random) | docker-compose | |
| `POSTGRES_HOST` | Workers Secrets | Owner | API Worker (only if Worker reads DB directly — usually via n8n) | If using HTTP-based driver, this is a connection string |
| `DATABASE_URL` | API Worker secret | Owner | API Worker | Constructed full URL with creds |
| `N8N_USER` / `N8N_PASSWORD` | VM `.env` | Owner | n8n basic auth (initial) | Replace with proper auth once n8n is reachable |
| `N8N_ENCRYPTION_KEY` | VM `.env` | Owner (random 32+ chars, **never change** after first run**) | n8n credential encryption | Losing this loses all n8n credentials |

### Geocoding

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `GEOCODER` | Workers env | Owner choice | Mileage calc | `nominatim` (free, no key) or `here` (free tier, key required) |
| `HERE_API_KEY` | Workers Secrets (if using HERE) | Owner | Mileage calc | Optional — only if using HERE |

### Optional: Local LLM

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `OLLAMA_BASE_URL` | n8n env (if used) | Owner | n8n async tasks | `http://ollama:11434` if same compose; external URL otherwise |
| `OLLAMA_MODEL` | n8n env | Owner | n8n async tasks | e.g., `qwen2.5:14b` |

### Backup (Phase 06)

| Var | Where stored | Provided by | Used by | Notes |
|-----|--------------|--------------|---------|-------|
| `R2_ACCOUNT_ID` | n8n credential | Owner | n8n nightly backup | Same as Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | n8n credential | Owner (R2 token) | Same | |
| `R2_SECRET_ACCESS_KEY` | n8n credential | Owner | Same | |
| `R2_BUCKET` | n8n env | Owner | Same | e.g., `rrr-backups` |

## Rotation Guidance

| Secret | Rotation cadence | Procedure |
|--------|------------------|-----------|
| `JWT_SECRET` | Annual or on-incident | Generate new, deploy Worker — invalidates all sessions, all techs re-login |
| `ANTHROPIC_API_KEY` | If leaked / annual | Generate new in console, update Workers Secrets + n8n |
| `ZOHO_REFRESH_TOKEN` | Only if revoked | Re-do OAuth flow, replace in both Workers and n8n |
| `TWILIO_AUTH_TOKEN` | Annual | Twilio dashboard rotate, update both places |
| `RESEND_API_KEY` | If leaked | Resend dashboard, update both places |
| `POSTGRES_PASSWORD` | Major incident only | Painful — requires downtime. Don't rotate casually. |
| `N8N_ENCRYPTION_KEY` | **Never** | Changing it loses encrypted credentials. Re-set them all if you must. |

## Local Dev `.env.local` Templates

`apps/api/.env.local`:
```
ZOHO_REFRESH_TOKEN=...
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_ORG_ID=...
ZOHO_REGION=com
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
JWT_SECRET=...
APP_URL=http://localhost:5173
WEB_URL=http://localhost:4321
SHOP_ADDRESS=...
OWNER_EMAIL=...
AUTHORIZED_TECH_EMAILS=...
DATABASE_URL=postgresql://rrr:rrr@localhost:5432/rrr
```

`apps/web/.env.local`:
```
PUBLIC_API_URL=http://localhost:8787
PUBLIC_FLOWS_WEBHOOK_URL=http://localhost:5678/webhook/intake
```

(`PUBLIC_*` prefix is Astro convention for vars exposed to client-side.)

`apps/tech-pwa/.env.local`:
```
VITE_API_URL=http://localhost:8787
VITE_STT_URL=http://localhost:8000
```

## Secret-Adjacent (Not Secret, But Sensitive)

These aren't secrets but should still be carefully managed:

- **Customer data** (in Zoho + Postgres cache) — handle per security baseline in `planning/11-dev-standards.md`
- **Shop address** — public-ish (it's on the website), but used as origin for mileage; if shop relocates, update `SHOP_ADDRESS`, `SHOP_LATITUDE`, `SHOP_LONGITUDE`, and re-geocode the cache
- **Backup files** — encrypted at rest in R2; only owner has download access
