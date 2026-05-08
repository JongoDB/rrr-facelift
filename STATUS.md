# Project Status

> **Source of truth for current phase.** Claude Code updates this at the end of every phase or when blocked. Humans read this to know where things stand.

## Current State

- **Active Phase:** `phase-02-intake-workflow` ⏸️ partial — Worker side feature-complete; n8n workflow JSON + live e2e await Docker stack
- **Repo:** [JongoDB/rrr-facelift](https://github.com/JongoDB/rrr-facelift) (public)
- **Branch + PR:** `phase-02/intake-workflow` — see PR link in [wrapups/phase-02-intake-workflow.md](wrapups/phase-02-intake-workflow.md)
- **Wrap-up:** [wrapups/phase-02-intake-workflow.md](wrapups/phase-02-intake-workflow.md)
- **Status:** 🟡 awaiting Cloudflare Tunnel + Twilio + Resend before the live intake workflow can be wired end-to-end

## Phase Tracker

| # | Phase | Status | Wrap-up | Notes |
|---|-------|--------|---------|-------|
| 00 | Foundation (repo, infra, creds) | ✅ complete | [phase-00-foundation.md](wrapups/phase-00-foundation.md) | Pushed to JongoDB/rrr-facelift; CI green |
| 01 | Service catalog + Zoho integration | ✅ complete (merged) | [phase-01-zoho-foundation.md](wrapups/phase-01-zoho-foundation.md) | PR #1 merged; OAuth client + 17 tool methods + 364-item catalog mirror |
| 02 | n8n self-hosted + intake form workflow | ⏸️ partial (Worker side) | [phase-02-intake-workflow.md](wrapups/phase-02-intake-workflow.md) | Worker routes + classifier + geocoder. n8n JSON deferred. |
| 03 | Website migration (Squarespace → Astro/CF) | ⬜ pending | — | |
| 04 | Tech PWA — chat + Zoho tool use | ⬜ pending | — | |
| 05 | Tech PWA — voice → line items | ⬜ pending | — | |
| 06 | Polish & expansion (reviews, customer portal) | ⬜ pending | — | |

**Status legend:** ⬜ pending · 🟡 in-progress · 🔴 blocked · ✅ complete · ⏸️ deferred / partial

## Active Blockers

Gating Phase 02 chunk 3 (n8n workflows + live intake e2e):

1. **Cloudflare Tunnel cert** — one-time `cloudflared tunnel login` on the VM (browser auth, no other path).
2. **Twilio number purchase + 10DLC registration** — CC + carrier approval (1-7 days).
3. **Resend domain verification** — DNS records on the `triple-r-rv.com` registrar.
4. **`ANTHROPIC_API_KEY`** in `apps/api/.env.local` — classifier falls back to a keyword stub without it; nothing breaks but the AI suggestions are absent.
5. **`RRR_INTERNAL_API_KEY`** — `openssl rand -hex 32` on owner's machine; set in `.env.local` and (eventually) Cloudflare Worker secrets.
6. **VM access** to run `docker compose up` live.

Resolved (Phase 02):

- ✅ **Shop address** — auto-resolved from `/organizations/{id}` ("255 Rock Hump Rd, Salisbury, NC"). Stored in `.env.local` / `.env.example`.

Resolved (Phase 01):

- ✅ GitHub repo + CI; tax rate; Zoho OAuth; org audit; catalog source-of-truth direction; Zoho Flow audit (Intake-only); 17-method tool surface.

## Recently Completed

- **2026-05-08 (Phase 02 chunks 1+2)** — Worker for intake workflow: Hono router with 9 `/zoho/*` endpoints + 2 `/agent/*` endpoints, shared-secret auth, Anthropic Haiku classifier (with deterministic stub fallback), free Nominatim mileage geocoder. Tests 83 → 121 (+38). Branch `phase-02/intake-workflow`, 2 commits, ~2,000 lines.
- **2026-05-08 (Phase 01)** — Service Catalog + Zoho Integration. Merged as PR #1 (`8c47890`). 17 typed Zoho tool methods + 364-item catalog mirror.
- **2026-05-08 (Phase 00)** — Foundation. Monorepo, tooling, infra skeleton, CI.

## Notes

- Project kicked off: 2026-05-08.
- Owner contact: see GitHub repo owner / private channel.
- Branch convention: `phase-NN/<short>` per CLAUDE.md.
