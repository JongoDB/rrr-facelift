# infra/

Self-hosted stack that runs on the owner's VM behind Cloudflare Tunnel.

## What's here

- `docker-compose.yml` — Postgres, n8n, Speaches (Whisper STT), Caddy (internal proxy), cloudflared (tunnel), Ollama (optional, GPU)
- `caddy/Caddyfile` — internal routing by Host header, reached only via Tunnel
- `postgres/init/01-schema.sql` — first-run schema bootstrap
- `n8n/workflows/` — workflow JSON files imported on container start (populated Phase 02+)
- `cloudflared/config.example.yml` — reference for the human one-time tunnel setup
- `.env.example` — Docker Compose runtime config template

## Quick reference

```bash
# Validate the compose file (no host requirements)
pnpm infra:config

# Bring everything up (requires .env on the host)
cp infra/.env.example infra/.env  # then fill in real values
pnpm infra:up

# Tear down
pnpm infra:down
```

## Phase 00 status

Skeleton committed and parses. No workflows yet — Phase 02 starts wiring real pipelines (intake form → SMS + Zoho draft, hourly Zoho item sync).

## CPU vs GPU Whisper

Default config uses CPU + `medium.en` + `int8`. To switch to GPU:

1. Edit `docker-compose.yml`: change `speaches` image to `:latest-cuda`, uncomment the `deploy` block.
2. Edit `infra/.env`: change `WHISPER_MODEL` to `Systran/faster-whisper-large-v3` and `WHISPER_COMPUTE_TYPE` to `float16`.
3. Recreate: `docker compose up -d --force-recreate speaches`.
