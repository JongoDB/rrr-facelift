# 10 — Infrastructure

## Hosts

| Host | Provider | Cost | Purpose |
|------|----------|------|---------|
| Static sites + Worker | Cloudflare Pages + Workers | $0 | `triple-r-rv.com`, `app.*`, `api.*` |
| Tunnel client | Cloudflare Tunnel | $0 | Exposes self-hosted services |
| Owner's VM | Owner's environment | $0 marginal | n8n, Speaches, Postgres, Ollama (optional) |
| DNS | Cloudflare | $0 | Authoritative DNS for triple-r-rv.com |
| File storage | Cloudflare R2 | $0 (within free tier) | Customer-uploaded photos, backups |

## VM Requirements

Recommended minimum:
- **CPU:** 4 cores (8+ if running Whisper on CPU)
- **RAM:** 8GB (16GB if running Ollama)
- **Disk:** 60GB SSD (Postgres + n8n state + Whisper models + audio uploads buffer)
- **OS:** Ubuntu 22.04 LTS or 24.04 LTS
- **GPU (optional):** any NVIDIA card with 8GB+ VRAM dramatically improves Whisper latency

## Docker Compose Stack

`infra/docker-compose.yml` outline (Claude Code implements):

```yaml
# Compose file v2.x; structure only — actual file in infra/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: rrr
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_HOST: flows.triple-r-rv.com
      N8N_PROTOCOL: https
      N8N_PORT: 5678
      WEBHOOK_URL: https://flows.triple-r-rv.com/
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: ${N8N_USER}
      N8N_BASIC_AUTH_PASSWORD: ${N8N_PASSWORD}
      GENERIC_TIMEZONE: America/New_York
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n/workflows:/workflows:ro       # imported on startup
    expose: ["5678"]

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cuda  # or :latest-cpu
    restart: unless-stopped
    environment:
      WHISPER__MODEL: Systran/faster-whisper-large-v3
      WHISPER__COMPUTE_TYPE: float16
    volumes:
      - speaches_models:/root/.cache/huggingface
    expose: ["8000"]
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]   # remove on CPU-only hosts

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    expose: ["80", "443"]

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - caddy

  # Optional: local LLM
  ollama:
    profiles: ["with-ollama"]
    image: ollama/ollama:latest
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    expose: ["11434"]
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

volumes:
  pgdata:
  n8n_data:
  speaches_models:
  caddy_data:
  caddy_config:
  ollama_data:
```

## Caddyfile (Internal Routing)

`infra/caddy/Caddyfile`:

```
{
  admin off
  auto_https off
}

# Caddy is reached only via Cloudflare Tunnel; TLS is terminated at Cloudflare.
# Internal routing matches by Host header set by cloudflared.

flows.triple-r-rv.com {
  reverse_proxy n8n:5678
}

stt.triple-r-rv.com {
  reverse_proxy speaches:8000
}

# Internal-only: Ollama (Worker doesn't reach it; n8n does)
ollama.internal {
  reverse_proxy ollama:11434
}
```

## Cloudflare Tunnel

One-time setup (human action — see `planning/12-human-actions.md`):

1. `cloudflared tunnel login` (browser auth)
2. `cloudflared tunnel create rrr-vm`
3. In Cloudflare dashboard, configure tunnel routing:
   - `flows.triple-r-rv.com` → `http://caddy:80`
   - `stt.triple-r-rv.com` → `http://caddy:80`
4. Get tunnel token, set as `CLOUDFLARE_TUNNEL_TOKEN` env var

After this, the tunnel reconnects automatically on container restart. Zero open inbound ports on the VM.

## Cloudflare Workers / Pages Setup

Infrastructure-as-code via `wrangler.toml` files in each app:

`apps/api/wrangler.toml`:
```toml
name = "rrr-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"
account_id = "<set via env>"
route = { pattern = "api.triple-r-rv.com/*", zone_name = "triple-r-rv.com" }

[vars]
ZOHO_REGION = "com"
ZOHO_ORG_ID = "<set via env, not secret>"
SHOP_ADDRESS = "<set via env>"
APP_URL = "https://app.triple-r-rv.com"

# Secrets set via `wrangler secret put`:
# ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET,
# ANTHROPIC_API_KEY, JWT_SECRET, RESEND_API_KEY, TWILIO_*
```

`apps/web/` and `apps/tech-pwa/` deployed via Cloudflare Pages with their own project configs in the dashboard, build commands in repo.

## Postgres Schema (Initial)

`infra/postgres/init/01-schema.sql`:

```sql
-- Cached items mirrored from Zoho (Phase 01)
CREATE TABLE IF NOT EXISTS items (
  catalog_id    text PRIMARY KEY,            -- our internal ID
  zoho_item_id  text UNIQUE,
  name          text NOT NULL,
  kind          text NOT NULL,
  unit          text NOT NULL,
  rate          numeric(10,2) NOT NULL,
  taxable       boolean DEFAULT false,
  category      text NOT NULL,
  keywords      text[],
  description   text,
  archived      boolean DEFAULT false,
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_items_keywords_gin ON items USING gin(keywords);
CREATE INDEX idx_items_category ON items(category) WHERE archived = false;

-- Cached customers for fast autocomplete (Phase 04)
CREATE TABLE IF NOT EXISTS customers (
  zoho_contact_id text PRIMARY KEY,
  display_name    text NOT NULL,
  first_name      text,
  last_name       text,
  phone           text,
  email           text,
  city            text,
  state           text,
  last_synced     timestamptz DEFAULT now()
);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('english', display_name || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')));

-- Geocode cache (Phase 02 — for mileage calc)
CREATE TABLE IF NOT EXISTS geocode_cache (
  address_hash   text PRIMARY KEY,
  address_input  text NOT NULL,
  latitude       double precision,
  longitude      double precision,
  miles_from_shop numeric(8,2),
  cached_at      timestamptz DEFAULT now()
);

-- Intake submissions (Phase 02)
CREATE TABLE IF NOT EXISTS intake_submissions (
  request_id          uuid PRIMARY KEY,
  received_at         timestamptz DEFAULT now(),
  service_type        text NOT NULL,
  customer_payload    jsonb NOT NULL,
  rv_payload          jsonb NOT NULL,
  problem_description text,
  zoho_contact_id     text,
  zoho_estimate_id    text,
  classification      jsonb,
  status              text DEFAULT 'received'
);

-- Audit log of tool calls (Phase 04)
CREATE TABLE IF NOT EXISTS tool_call_log (
  id            bigserial PRIMARY KEY,
  user_email    text,
  tool_name     text NOT NULL,
  input         jsonb,
  output        jsonb,
  duration_ms   integer,
  ok            boolean,
  error         text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_tool_call_log_created ON tool_call_log(created_at DESC);

-- Magic link tokens (Phase 04)
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token_hash    text PRIMARY KEY,
  email         text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);

-- Workflow tracking tables (Phase 06)
CREATE TABLE IF NOT EXISTS review_requests (
  id              bigserial PRIMARY KEY,
  zoho_invoice_id text NOT NULL UNIQUE,
  customer_phone  text,
  sent_at         timestamptz,
  responded       boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS estimate_followups (
  zoho_estimate_id text PRIMARY KEY,
  followup_count   integer DEFAULT 0,
  last_sent_at     timestamptz
);
```

## Backups

Phase 06 includes automated backups. Strategy:

- Nightly `pg_dump --format=custom rrr` → upload to Cloudflare R2 bucket `rrr-backups`
- Retention: 14 daily, 12 weekly, 6 monthly
- Restore tested quarterly
- Backup script run via n8n cron workflow `06-nightly-backup`

## Resource Sizing

Expected loads:
- Intake form submissions: <10/day
- Tool calls per day (PWA): <500
- Voice transcriptions: <50/day
- n8n workflow runs: <500/day

VM at recommended specs has ~10x headroom. Cloudflare Workers free tier (100k req/day) has ~200x headroom.

## Monitoring & Alerts

Phase 06:
- **Uptime:** UptimeKuma in the stack OR Better Uptime free tier (5 monitors free)
- **Logs:** Workers logs via Cloudflare dashboard (sufficient at this scale)
- **n8n errors:** Error sub-workflow → Twilio SMS to owner
- **Postgres:** `pg_isready` healthcheck in compose
- **Speaches:** simple `/health` endpoint check from n8n every 5 min

## Recovery

If the VM dies:
1. Spin up replacement
2. Install Docker
3. Clone repo
4. Restore latest `pg_dump` to a fresh Postgres
5. `docker compose up -d`
6. Cloudflare Tunnel reconnects automatically (token in env)
7. n8n imports workflows from repo on startup

Recovery time: <30 min if owner has `.env` backed up safely.
