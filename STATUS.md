# Project Status

> **Source of truth for current phase.** Claude Code updates this at the end of every phase or when blocked. Humans read this to know where things stand.

## Current State

- **Active Phase:** `phase-00-foundation`
- **Last Completed:** Phase 00 — Foundation (locally; CI verification pending GitHub remote)
- **Status:** ✅ complete locally · 🔴 blocked on human inputs before Phase 01 begins
- **Wrap-up:** [wrapups/phase-00-foundation.md](wrapups/phase-00-foundation.md)
- **Blockers:** see "Active Blockers" below

## Phase Tracker

| # | Phase | Status | Wrap-up | Notes |
|---|-------|--------|---------|-------|
| 00 | Foundation (repo, infra, creds) | ✅ complete | [phase-00-foundation.md](wrapups/phase-00-foundation.md) | 5 commits on `main`; CI green pending push |
| 01 | Service catalog + Zoho integration | ⬜ pending | — | Awaits unblockers (Zoho OAuth, rates, tax rate) |
| 02 | n8n self-hosted + intake form workflow | ⬜ pending | — | |
| 03 | Website migration (Squarespace → Astro/CF) | ⬜ pending | — | |
| 04 | Tech PWA — chat + Zoho tool use | ⬜ pending | — | |
| 05 | Tech PWA — voice → line items | ⬜ pending | — | |
| 06 | Polish & expansion (reviews, customer portal) | ⬜ pending | — | |

**Status legend:** ⬜ pending · 🟡 in-progress · 🔴 blocked · ✅ complete · ⏸️ deferred

## Active Blockers

Gating Phase 01 (full detail in [wrapups/phase-00-foundation.md](wrapups/phase-00-foundation.md)):

1. **GitHub repo location decision + push** — needed to verify CI pipeline.
2. **Zoho OAuth credentials** — `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_REGION`.
3. **Confirmed catalog rates** for 18 items currently flagged with `rateNeedsConfirmation: true` in [packages/service-catalog/src/catalog.ts](packages/service-catalog/src/catalog.ts).
4. **NC + Rowan County combined tax rate** — set `QUOTE_RULES.taxRate`.
5. **Sandbox vs production Zoho org** decision.

Cosmetic (not Phase-01-blocking, useful early):

6. **Shop address + lat/long** — for `SHOP_ADDRESS`/`SHOP_LATITUDE`/`SHOP_LONGITUDE` env vars used in Phase 02 mileage calc.

## Recently Completed

- **2026-05-08** — Phase 00 Foundation closed. Monorepo, tooling, infra skeleton, and CI committed. `pnpm install/test/lint/typecheck` and `pnpm infra:config` all green locally. 89 files / 6,409 lines / 5 commits.

## Notes

- Project kicked off: 2026-05-08 (Phase 00 session).
- Owner contact: see GitHub repo owner / private channel.
- All Phase-00 commits live on `main`; subsequent phases follow the `phase-NN/<short>` branch convention from CLAUDE.md.
