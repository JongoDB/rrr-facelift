# Project Status

> **Source of truth for current phase.** Claude Code updates this at the end of every phase or when blocked. Humans read this to know where things stand.

## Current State

- **Active Phase:** `phase-00-foundation` ✅ complete (all exit criteria met, CI green)
- **Repo:** [JongoDB/rrr-facelift](https://github.com/JongoDB/rrr-facelift) (public)
- **Wrap-up:** [wrapups/phase-00-foundation.md](wrapups/phase-00-foundation.md)
- **Status:** 🟡 awaiting Phase 01 unblockers (Zoho OAuth + catalog-source decision)
- **Blockers:** see "Active Blockers" below

## Phase Tracker

| # | Phase | Status | Wrap-up | Notes |
|---|-------|--------|---------|-------|
| 00 | Foundation (repo, infra, creds) | ✅ complete | [phase-00-foundation.md](wrapups/phase-00-foundation.md) | Pushed to JongoDB/rrr-facelift; CI green |
| 01 | Service catalog + Zoho integration | ⬜ pending | — | Awaits unblockers (Zoho OAuth, rates, tax rate) |
| 02 | n8n self-hosted + intake form workflow | ⬜ pending | — | |
| 03 | Website migration (Squarespace → Astro/CF) | ⬜ pending | — | |
| 04 | Tech PWA — chat + Zoho tool use | ⬜ pending | — | |
| 05 | Tech PWA — voice → line items | ⬜ pending | — | |
| 06 | Polish & expansion (reviews, customer portal) | ⬜ pending | — | |

**Status legend:** ⬜ pending · 🟡 in-progress · 🔴 blocked · ✅ complete · ⏸️ deferred

## Active Blockers

Gating Phase 01:

1. **Zoho OAuth credentials** in [apps/api/.env.local](apps/api/.env.local) (gitignored; placeholders already in place) — `ZOHO_REFRESH_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ORG_ID`, `ZOHO_REGION` (likely `com`).
2. **Catalog-source direction** — confirm whether RRR's Zoho Books org already carries the service items with real rates. If yes (likely), Phase 01 PULLs Zoho → mirrors locally; the placeholder `rate: 0` entries get overwritten from Zoho. If not, we PUSH the placeholder catalog and you fill in rates first.
3. **Sandbox vs production Zoho org** — assume production with `[TEST]` cleanup tagging unless told otherwise.

Useful early (not Phase-01-blocking):

4. **Shop address + lat/long** — for `SHOP_ADDRESS`/`SHOP_LATITUDE`/`SHOP_LONGITUDE` (Phase 02 mileage calc).

Resolved:

- ✅ **GitHub repo created** ([JongoDB/rrr-facelift](https://github.com/JongoDB/rrr-facelift)) and CI green.
- ✅ **NC + Rowan County tax rate** — set to 6.75% in `QUOTE_RULES.taxRate`. Zoho Books remains the system of record for actual tax application.

## Recently Completed

- **2026-05-08** — Phase 00 Foundation closed. Monorepo, tooling, infra skeleton, and CI committed. `pnpm install/test/lint/typecheck` and `pnpm infra:config` all green locally. 89 files / 6,409 lines / 5 commits.

## Notes

- Project kicked off: 2026-05-08 (Phase 00 session).
- Owner contact: see GitHub repo owner / private channel.
- All Phase-00 commits live on `main`; subsequent phases follow the `phase-NN/<short>` branch convention from CLAUDE.md.
