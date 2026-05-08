# Phase 00 — Foundation — Wrap-up

> **For the human owner.** Read top to bottom; everything below "Delivered" is supporting detail.

**Phase status:** ✅ complete (all locally-verifiable exit criteria pass; one CI exit criterion needs the GitHub remote)
**Date:** 2026-05-08
**Branch / PRs:** `main` (5 commits — `be0110a..2027eca`); no remote yet
**Time spent:** ~1 active session

---

## TL;DR

Monorepo, tooling, workspace stubs, infra compose stack, and CI workflow are committed and locally verified — `pnpm install && pnpm test && pnpm lint && pnpm typecheck && pnpm infra:config` all green. To unblock **Phase 01 (Service Catalog + Zoho)** I need: GitHub repo location, Zoho OAuth credentials, confirmed dollar rates for ~18 catalog items, and the NC + Rowan County tax rate.

---

## Delivered

- [x] **Monorepo structure** per planning/03-tech-stack.md — `apps/{web,tech-pwa,api}`, `packages/{shared,service-catalog,zoho-tools,agent}`, `infra/`, `scripts/`, `e2e/`, `.github/`
- [x] **pnpm 10 workspaces** with shared dep [`catalog`](pnpm-workspace.yaml) — `pnpm install` clean, 124 packages, 2.6s
- [x] **TypeScript 5.9 strict** base config — [tsconfig.base.json](tsconfig.base.json) — `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`. Each workspace extends with its own `rootDir` + appropriate `lib`.
- [x] **Biome 2.4** combined linter + formatter — [biome.json](biome.json) — single-quote, semis, 100 col, organize-imports on save. `pnpm lint` clean across 43 files.
- [x] **Vitest 3.2** with workspace-wide test discovery — [vitest.config.ts](vitest.config.ts). **19/19 tests pass** across 8 files (~300ms).
- [x] **Playwright 1.59** configured with chromium + mobile-safari projects — [playwright.config.ts](playwright.config.ts). Smoke spec at [e2e/smoke.spec.ts](e2e/smoke.spec.ts) — config loads, test discovery works (`playwright test --list` returns the 2 expected projects). Browser binaries left uninstalled (~300MB each); installed in Phase 03's CI step when real e2e flows come online.
- [x] **GitHub Actions CI** — [.github/workflows/ci.yml](.github/workflows/ci.yml) — two jobs: `lint+typecheck+vitest` and `docker-compose-validate`. Will run on first push to remote.
- [x] **Docker Compose stack skeleton** — [infra/docker-compose.yml](infra/docker-compose.yml) — postgres 16, n8n latest, speaches CPU (GPU swap documented inline), caddy 2 internal proxy, cloudflared, optional ollama profile. `pnpm infra:config` produces valid resolved YAML.
- [x] **Caddy internal routing** — [infra/caddy/Caddyfile](infra/caddy/Caddyfile) — Host-header routing for `flows.*` → n8n, `stt.*` → speaches.
- [x] **Postgres init schema** — [infra/postgres/init/01-schema.sql](infra/postgres/init/01-schema.sql) — items, customers, geocode_cache, intake_submissions, tool_call_log, magic_link_tokens, review_requests, estimate_followups, with the GIN/trigram indexes from planning/10.
- [x] **`.env.example` per workspace + root + infra** — every variable in [planning/13-secrets-manifest.md](planning/13-secrets-manifest.md) is either documented or stubbed.
- [x] **Locked-spec deliverables that wouldn't normally ship in Phase 00 but had no reason to wait:**
  - `@rrr/shared` exports the strict zod intake schema (mobile/shop branching, address-required-when-mobile, SMS consent literal-true), the line-item schema, and 9 business constants — verified by 5 unit tests.
  - `@rrr/service-catalog` carries the typed catalog (`CatalogItem`, `ItemKind`, `ItemUnit`, `ServiceCategory`, `QuoteRules`) and the **initial 22-item seed** spanning labor, fees, roof, parts, towing, diagnostics, inspection, winterization, water-damage, and discounts — verified by 5 unit tests including id-uniqueness and keyword-coverage. Items needing owner rates are flagged with `rateNeedsConfirmation: true` so Phase 01's seed script can prompt before pushing to Zoho.

---

## Blocked On (Human Required)

| # | Item | Why it requires a human | How to provide |
|---|------|--------------------------|----------------|
| 1 | **GitHub repo location decision** + push | Account ownership, repo naming, public/private | Create the repo (suggest `rrr-automation` private), then either share an SSH/HTTPS URL or paste a fine-grained PAT with `contents:write` and `actions:write` so I can push and verify CI on first run. |
| 2 | **Zoho OAuth credentials** (Phase 01 prereq) | Browser login + Self-Client creation in Zoho API Console | Steps in [planning/12-human-actions.md](planning/12-human-actions.md#phase-01--service-catalog--zoho-integration). Provide `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_REGION` (likely `com`). |
| 3 | **Confirm catalog rates** for items currently flagged with `rateNeedsConfirmation: true` (Phase 01 prereq) | Pricing is owner's call | Set dollar values for these 18 items in [`packages/service-catalog/src/catalog.ts`](packages/service-catalog/src/catalog.ts) (or hand me the numbers and I'll edit). The list: `labor.standard`, `labor.afterhours`, `roof.reseal.peel_seal`, `roof.protrusion.reseal`, `parts.dicor_sl`, `parts.eternabond`, `parts.vent_gasket`, `parts.butyl_tape`, `tow.baseplate.install`, `tow.brakes.install`, `tow.lights.install`, `elec.diagnostic`, `plumb.diagnostic`, `mech.diagnostic`, `inspect.full`, `winter.complete`, `winter.dewinter`, `water_damage.assessment`. |
| 4 | **NC + Rowan County combined tax rate** (Phase 01 prereq) | Owner-verified | Set `QUOTE_RULES.taxRate` in [`packages/service-catalog/src/catalog.ts`](packages/service-catalog/src/catalog.ts) (e.g., `0.07` for a placeholder 7%). |
| 5 | **Sandbox vs. production Zoho org** (Phase 01 decision) | Risk preference | Confirm whether seeding the catalog should hit your live Zoho Books org (with `[TEST]` cleanup tagging) or a Zoho sandbox if you have one. |
| 6 | **Shop address + lat/long** (Phase 02 prereq, but cheap to provide now) | Owner-supplied | I'll compute lat/long from the address; just need `SHOP_ADDRESS` (street, city, state, zip). |

Items #1, #2, #3, #4, #5 all gate Phase 01. Item #6 is cosmetic for Phase 01 but lands in `.env` files for Phase 02.

---

## Recommended Next

- **Proposed:** **Phase 01 — Service Catalog + Zoho Integration** ([planning/04-phases.md#phase-01](planning/04-phases.md))
- **Rationale:** With #2–#5 above unblocked, Phase 01 is direct execution: build `packages/zoho-tools` (OAuth + 11 Claude tools), write idempotent `pnpm seed:catalog`, write the hourly `pnpm sync:items` script, add Drizzle migrations for the cached items table.
- **Estimated effort:** 1–2 sessions per planning doc estimate; matches my read.
- **Prerequisites:** Items #2–#5. Item #1 only blocks CI verification, not local work — I can start Phase 01 the moment Zoho creds arrive.

---

## Defer List

| Item | Reason deferred | Suggested phase to revisit |
|------|-----------------|-----------------------------|
| Astro project init for `apps/web` | Phase 03 starts with `pnpm create astro` in this workspace; pinning Astro/Tailwind versions before they're used would only create migration churn | Phase 03 |
| Vite + React project init for `apps/tech-pwa` | Same logic — Phase 04 starts with `pnpm create vite` | Phase 04 |
| Wrangler runtime, hono dep, Anthropic SDK, Twilio SDK, Resend SDK | Each is added in the phase that consumes it (Phase 02 wires `apps/api` to live workflows; Phase 02/04 add the agent SDK; Phase 02 adds Twilio/Resend nodes in n8n) | Phase 02 |
| Drizzle migration tooling + schema | Phase 01 introduces the cached items table and is the natural moment to add `drizzle-kit` + `migrations/` | Phase 01 |
| Playwright browser binaries (~300MB each) | Real e2e flows don't exist yet; CI will install on demand | Phase 03 |
| `pnpm approve-builds` for esbuild's optional install scripts | Esbuild works without them; only needed if odd coverage edge cases appear | Phase 02 if observed |
| Repo-level branch protection + CODEOWNERS | Requires the GitHub remote first | Right after item #1 above lands |

---

## Decisions Made

### ADR-001: Node 22 LTS / pnpm 10 instead of Node 20 / pnpm 9 (per planning/03)

- **Decision:** Target Node 22 (current LTS) and pnpm 10 (current major) as the engines requirement.
- **Alternatives considered:** Pinning to Node 20 / pnpm 9 as written in planning/03-tech-stack.md.
- **Why:** Node 22 became LTS in October 2024 and is the active LTS through Q2 2026; Cloudflare Workers' `nodejs_compat` flag supports it. pnpm 10 introduces the workspace-level `catalog:` feature I'm using to share dep versions. No compatibility blockers.
- **Reversibility:** easy — single `engines` change in root `package.json` + `.nvmrc`.
- **Doc impact:** propose a 1-line edit to planning/03-tech-stack.md ("Node 22 LTS, pnpm 10.x"). Not made unilaterally; flagging here for approval.

### ADR-002: Stub apps with placeholders instead of installing frameworks now

- **Decision:** `apps/web` and `apps/tech-pwa` ship with a placeholder export + smoke test. `apps/api` ships with a minimal Worker `fetch` handler that exercises a cross-package import.
- **Alternatives considered:** Run `pnpm create astro` and `pnpm create vite` now to lock the framework choice.
- **Why:** Phase 00's exit criteria only require the structure to exist. Pinning Astro/Vite versions ~3 months before Phase 03/04 actually uses them creates migration drag. Phase 03 starts fresh with whatever Astro is current then.
- **Reversibility:** trivial — `pnpm create` overwrites the directory.

### ADR-003: Speaches CPU image as the default; GPU is opt-in

- **Decision:** `infra/docker-compose.yml` ships with `speaches:latest-cpu` + `int8` quantization + `medium.en` model, with the GPU swap documented inline.
- **Alternatives considered:** Default to `:latest-cuda` and require all hosts to have an NVIDIA GPU.
- **Why:** `docker compose config` and CI must work on the GitHub Actions Ubuntu runner (no GPU). Owner can flip to GPU on the production VM with a 3-line change.
- **Reversibility:** easy — one image-tag edit + uncomment a `deploy:` block.

### ADR-004: Initial commit lives directly on `main`

- **Decision:** Phase 00 bootstrap is committed as 5 commits on `main`, not on a `phase-00/foundation` branch.
- **Alternatives considered:** Create the branch first and merge.
- **Why:** A repo with zero commits has no `main` to branch from. Subsequent phases use the `phase-NN/<short>` branch convention from CLAUDE.md.
- **Reversibility:** trivial — branch convention applies to all future phases.

---

## Tests & Verification

```text
pnpm test       → 19/19 passing across 8 files (~300ms)
pnpm typecheck  → 7/7 workspaces clean (apps/web has no .ts that needs typecheck yet)
pnpm lint       → biome check . → 0 errors / 0 warnings (43 files)
pnpm infra:config → valid resolved compose YAML
pnpm exec playwright test --list → 2 tests across [chromium, mobile-safari]
git log         → 5 commits on main (be0110a → 2027eca)
```

Manual verification:
- Cross-workspace import works: `apps/api/src/index.ts` calls `resolveZohoBaseUrl` from `@rrr/zoho-tools` and the test verifies `/healthz` returns the expected URL.
- `@rrr/shared`'s intake schema rejects mobile-without-address (asserted in test).
- Catalog id uniqueness + keyword non-emptiness asserted in test.

CI verification: pending push to GitHub remote (item #1 in **Blocked On**).

---

## Risks & Watch-outs

- **Esbuild build scripts blocked by pnpm 10's default security policy** — informational message during install. Doesn't break runtime; if Vitest coverage starts misbehaving in some edge case, run `pnpm approve-builds` and pick `esbuild`.
- **Playwright browsers not yet installed.** Anyone running `pnpm e2e` locally before Phase 03 needs `pnpm exec playwright install chromium` first. Documented in this wrap-up; will be wired into Phase 03's CI job.
- **Owner has zero visible UI to react to yet.** Phase 03 is the first phase with anything to look at. Worth budgeting an extra owner-review cycle there (planning/04 already accounts for this).
- **18 catalog items + the global tax rate are placeholder zeros.** A failed `pnpm seed:catalog` against a real Zoho org won't be silent (the script will refuse to push items with rate=0 unless explicitly bypassed) but worth a reminder.
- **No remote yet means no CI signal.** Locally green ≠ CI green. First push will surface anything specific to the Ubuntu runner.

---

## Stats

- **Files in repo (tracked):** 89
- **Lines added (Phase 00 commits):** 6,409 insertions / 0 deletions
- **Commits:** 5 (`be0110a..2027eca`)
- **New deps (top-level catalog):** typescript ^5.7.2, @types/node ^22.10.5, vitest ^3.0.4, @vitest/coverage-v8 ^3.0.4, @biomejs/biome ^2.2.0, @playwright/test ^1.49.1, zod ^3.24.1, hono ^4.6.16, drizzle-orm ^0.38.3, drizzle-kit ^0.30.1, postgres ^3.4.5, react ^19.0.0, react-dom ^19.0.0, @types/react ^19.0.7, @types/react-dom ^19.0.3 — runtime use ramps up phase by phase.
- **New env vars added to `.env.example`:** all 30+ vars from [planning/13-secrets-manifest.md](planning/13-secrets-manifest.md), distributed across `apps/api/.env.example`, `apps/web/.env.example`, `apps/tech-pwa/.env.example`, `packages/zoho-tools/.env.example`, `packages/agent/.env.example`, `infra/.env.example`, and the root `.env.example`.

---

## Files / Links Reference

- Repo root configs: [package.json](package.json) · [pnpm-workspace.yaml](pnpm-workspace.yaml) · [tsconfig.base.json](tsconfig.base.json) · [biome.json](biome.json) · [vitest.config.ts](vitest.config.ts) · [playwright.config.ts](playwright.config.ts)
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml)
- Service catalog seed: [packages/service-catalog/src/catalog.ts](packages/service-catalog/src/catalog.ts)
- Zod intake schema: [packages/shared/src/schemas/intake.ts](packages/shared/src/schemas/intake.ts)
- API stub Worker: [apps/api/src/index.ts](apps/api/src/index.ts) · [apps/api/wrangler.toml](apps/api/wrangler.toml)
- Compose stack: [infra/docker-compose.yml](infra/docker-compose.yml) · [infra/caddy/Caddyfile](infra/caddy/Caddyfile) · [infra/postgres/init/01-schema.sql](infra/postgres/init/01-schema.sql)
- Status tracker: [STATUS.md](STATUS.md)

---

*Phase 00 closed. Next session resumes from `STATUS.md` after the Blocked-On items above are unblocked (or after explicit "proceed" with the rate confirmations to follow asynchronously).*
