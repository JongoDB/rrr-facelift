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

1. **Sandbox vs production Zoho org** — proceeding against production unless told otherwise. Audit was read-only; future writes will tag `[TEST]` records for cleanup.

Useful early (not Phase-01-blocking):

2. **Shop address + lat/long** — for `SHOP_ADDRESS`/`SHOP_LATITUDE`/`SHOP_LONGITUDE` (Phase 02 mileage calc).

Resolved:

- ✅ **GitHub repo created** ([JongoDB/rrr-facelift](https://github.com/JongoDB/rrr-facelift)) and CI green.
- ✅ **NC + Rowan County tax rate** — set to 6.75% in `QUOTE_RULES.taxRate`. Zoho Books remains the system of record for actual tax application.
- ✅ **Zoho OAuth credentials** — Self Client created, refresh token minted, scopes granted: `ZohoBooks.{contacts,estimates,invoices,items}.ALL`, `settings.READ`, `customerpayments.CREATE`, `salesorders.ALL`. Stored in [apps/api/.env.local](apps/api/.env.local) (gitignored).
- ✅ **Zoho org audit complete** — see [planning/14-zoho-org-schema.md](planning/14-zoho-org-schema.md). Big shifts: catalog source-of-truth reversed (Zoho canonical, we mirror), intake template format pinned, comment_type semantics defined, mobile pricing duality documented. Affected docs (`planning/05`, `planning/06`) updated with cross-references.
- ✅ **Catalog-source direction decided** — Zoho's 364 items are canonical; Phase 01 builds `pnpm sync:catalog` to PULL into a typed local mirror with derived keywords/units/ids.

## Recently Completed

- **2026-05-08** — Phase 00 Foundation closed. Monorepo, tooling, infra skeleton, and CI committed. `pnpm install/test/lint/typecheck` and `pnpm infra:config` all green locally. 89 files / 6,409 lines / 5 commits.

## Notes

- Project kicked off: 2026-05-08 (Phase 00 session).
- Owner contact: see GitHub repo owner / private channel.
- All Phase-00 commits live on `main`; subsequent phases follow the `phase-NN/<short>` branch convention from CLAUDE.md.
