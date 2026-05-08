# @rrr/api

Cloudflare Worker that hosts:

- The Anthropic proxy (so the API key never reaches the browser)
- Magic-link auth issuer + JWT session validator
- The shared Zoho tool dispatcher used by both the tech PWA and n8n
- File-upload signing for customer photos → Cloudflare R2

Deployed to `api.triple-r-rv.com`.

## Phase 00 status

Stub. The full Hono router, JWT auth, Zoho proxy endpoints, and Anthropic streaming proxy are built up across **Phases 02–05** as their consumers come online. `wrangler.toml` is committed with placeholders so deploy plumbing is in place.

## Configuration

Local dev uses `.env.local` (gitignored). Production secrets live in Cloudflare Workers Secrets — see `planning/13-secrets-manifest.md`.

## Local dev

Phase 02 wires `pnpm dev` to `wrangler dev`. Until then, the workspace exists for typecheck + cross-package imports.
