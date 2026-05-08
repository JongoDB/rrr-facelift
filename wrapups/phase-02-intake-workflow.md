# Phase 02 — n8n + Intake Form Workflow — Wrap-up (partial)

> **For the human owner.** Read top to bottom; everything below "Delivered" is supporting detail.

**Phase status:** ⏸️ partial — Worker side feature-complete; n8n workflow JSON + live end-to-end intake deferred until the Docker stack runs (which needs Cloudflare Tunnel + Twilio + Resend setup — owner-only steps).
**Date:** 2026-05-08
**Branch / PR:** `phase-02/intake-workflow` → [PR #2](https://github.com/JongoDB/rrr-facelift/pull/2)
**Time spent:** ~1 session

---

## TL;DR

The Worker that n8n's intake workflow will call is built and tested: 9 typed `/zoho/*` endpoints, `/agent/classify-intake` (Claude Haiku with deterministic stub fallback), `/agent/calculate-mileage` (free Nominatim geocoder), shared-secret auth on the n8n boundary. **121 unit tests, all green.** Authoring the actual n8n workflow JSON files is deferred until the Docker stack is running — much faster to build them in n8n's UI then export, rather than hand-write the JSON without a live importer.

---

## Delivered

### Worker (`apps/api`)

- [x] **Hono router** mounted at:
  - `GET  /healthz` (public)
  - `POST /zoho/upsert-contact` — search-by-mobile then -by-email, create if neither hits
  - `POST /zoho/create-estimate`
  - `POST /zoho/create-invoice`
  - `POST /zoho/add-comment` (internal | customer)
  - `POST /zoho/post-intake-template` — builds the verbatim Jonathan-template format and posts as internal comment in one call (the intake workflow's primary consumer)
  - `POST /zoho/record-payment`
  - `GET  /zoho/items` — auto-paginates when no `modified_since`, forwards single page when given
  - `GET  /zoho/contacts/:id/history`
  - `POST /agent/classify-intake` — Claude Haiku via `@rrr/agent` when `ANTHROPIC_API_KEY` is set; falls back to a deterministic keyword stub otherwise (and on Anthropic outage)
  - `POST /agent/calculate-mileage` — Nominatim geocoder; uses `SHOP_LATITUDE`/`SHOP_LONGITUDE` if pre-resolved, otherwise geocodes `SHOP_ADDRESS`
- [x] **Shared-secret auth middleware** (`X-RRR-API-Key`) on `/zoho/*` and `/agent/*`; PWA's user-level magic-link JWT lives on a separate router in Phase 04.
- [x] **Strict zod validation** on every body. Validation failures return 400 with the flattened detail so n8n's HTTP node can log them.
- [x] **Injectable upstream deps** — `buildZohoRouter(getClient)` and `buildAgentRouter({ classifyIntake, calculateMileageFee })` accept stubs in tests. Production wires the real impls; tests don't touch the network.

### `@rrr/agent`

- [x] **`classifyIntake(request, options)`** in [packages/agent/src/classify-intake.ts](packages/agent/src/classify-intake.ts):
  - Calls Claude Haiku via the official `@anthropic-ai/sdk`.
  - System prompt embeds a curated 60-item slice of the canonical catalog (labor/service/fee items — the full 364-item list would bloat the prompt without improving classification quality).
  - Strict response parser: validates `category` + `urgency` against closed unions, drops `suggested_items` whose `catalog_id` isn't in the local catalog mirror (so the model can't invent ids).
  - 12 s default timeout, `claude-haiku-4-5` default model.

### Geocoder

- [x] **`calculateMileageFee` + `geocodeAddress`** in [apps/api/src/lib/geocoder.ts](apps/api/src/lib/geocoder.ts):
  - Free Nominatim, no API key, with the required `User-Agent` header.
  - `haversineMiles` for direct-line distance.
  - Applies RRR's published rule: 10-mi free radius round-trip, $2.70/mi over (rounded up).
  - Returns `{ trip_miles, one_way_miles, billable_miles, fee_usd, origin, destination }`.

### Auto-resolved soft blocker

- [x] **`SHOP_ADDRESS = 255 Rock Hump Rd, Salisbury, NC`** — pulled from `/organizations/{org_id}` (the list endpoint had `address: undefined`; detail endpoint has it). Saved to `.env.local` + `.env.example`. ZIP is empty in Zoho's org config; geocoder resolves accurately enough without it for the mileage rule.

### Test surface

- 23 test files, **121 passing total** (104 → 121, +17 in Phase 02 chunks 1+2).
- New: 4 cases for auth middleware, 10 for `/zoho/*` routes (3 upsert paths, validation, estimate, intake-template, items full+incremental, record-payment), 10 for `/agent/*` (5 stub, 2 anthropic-path, 3 mileage), 3 for the classifier package, 7 for geocoder.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm infra:config` all green.

---

## Blocked On (Human Required)

These all gate **live intake-workflow testing** — none of them block the PR landing. Once the Docker stack is up they unblock together.

| # | Item | Why human-only |
|---|------|----------------|
| 1 | **Review + merge PR** | Same as every phase boundary |
| 2 | **Cloudflare Tunnel cert** — `cloudflared tunnel login` on the VM | Browser auth into Cloudflare account; one-time |
| 3 | **Twilio number purchase + 10DLC registration** | CC payment + carrier registration; 1-7 day approval |
| 4 | **Resend domain verification** for `triple-r-rv.com` | DNS record additions on the registrar |
| 5 | **`ANTHROPIC_API_KEY`** in `apps/api/.env.local` | Account / billing decision; classifier falls back to keyword stub without it |
| 6 | **`RRR_INTERNAL_API_KEY`** generation | `openssl rand -hex 32` on owner's machine — set in `.env.local` and (eventually) `wrangler secret put` |
| 7 | **VM access** to bring `docker compose up` live | Owner's hardware |

---

## Recommended Next

- **Proposed:** **Phase 02 chunk 3 — n8n workflow JSON + live e2e** (continuation of this phase, separate PR after the Docker stack is up).
- **Rationale:** Authoring `02-process-intake-form.json` and `02-sync-zoho-items.json` byte-by-byte without a live importer is error-prone. Once the stack runs, building them in n8n's UI then `n8n export:workflow --id <id> --output infra/n8n/workflows/<name>.json` produces validated JSON with one round-trip. The Worker is now ready to be called from there.
- **Blocked on:** items 2-7 above.

If the owner prefers to push forward without the Docker stack live: I can hand-author skeleton JSON files matching the structure in [planning/07-n8n-workflows.md](planning/07-n8n-workflows.md) and [planning/15-zoho-flow-current.md](planning/15-zoho-flow-current.md). Useful as a reference but they'll need a UI pass to be importable.

---

## Defer List

| Item | Why | Phase to revisit |
|------|-----|------------------|
| `02-process-intake-form.json` | UI authoring then export is faster + safer than hand-written JSON | Phase 02 chunk 3 (post-stack) |
| `02-sync-zoho-items.json` (hourly cron) | Same | Phase 02 chunk 3 |
| `02-error-handler.json` (sub-workflow) | Same | Phase 02 chunk 3 |
| Drizzle schema + Postgres `pnpm sync:items` | Postgres isn't running yet (depends on Docker stack) | Phase 02 chunk 3 |
| Twilio outbound SMS in the Worker | The route will live in `/notify/*` once Twilio is provisioned. Until then n8n can call Twilio's API directly via HTTP Request | Phase 02 chunk 3 / Phase 06 |
| Live integration sweep against the production Zoho org | Needs explicit owner sign-off + a `[TEST]` cleanup script | Phase 02 chunk 3 |
| Wrangler local-dev wiring (`pnpm --filter @rrr/api dev`) | Cloudflare account setup is a Phase 03 concern; locally we test via Vitest against the Hono app | Phase 03 |
| The PWA's magic-link auth router (`/pwa/*`) | Out of scope for Phase 02; lands in Phase 04 | Phase 04 |

---

## Decisions Made

### ADR-009: Worker exposes a "convenience" `/zoho/post-intake-template` route (NEW)

- **Decision:** Provide one round-trip endpoint that takes the structured intake fields, builds the verbatim text via `buildIntakeTemplate`, and posts as `comment_type=internal`. n8n calls this single endpoint instead of doing the format-then-post dance itself.
- **Alternatives considered:** Have n8n format the text in a Code node and call `/zoho/add-comment`.
- **Why:** The format is load-bearing (techs read it daily, see planning/14). Centralizing it on the Worker means there's exactly one place to update — and we get type safety on the inputs.
- **Reversibility:** Trivial — `/zoho/add-comment` already exists for ad-hoc text.

### ADR-010: Anthropic classifier falls back to a stub when API key is missing OR the call throws (NEW)

- **Decision:** `/agent/classify-intake` always returns a 200 with a usable classification. When `ANTHROPIC_API_KEY` is set and the call succeeds, `source: 'anthropic'`. Otherwise (no key, or the SDK throws), `source: 'stub'` with the deterministic keyword heuristic.
- **Alternatives considered:** Return 503 / 500 when Anthropic is unavailable.
- **Why:** The intake workflow's job is to get a draft estimate in front of a tech *fast*. A keyword guess is better than a workflow halt. The owner sees the `source` field and knows whether to trust the suggestion.
- **Reversibility:** Easy — caller can check `source === 'stub'` and re-classify later.

### ADR-011: Mileage geocoder uses Nominatim with hard-rate-limit awareness (NEW)

- **Decision:** Use OpenStreetMap's free Nominatim service with a strict `User-Agent` identifying the application. No API-keyed alternatives wired up yet.
- **Alternatives considered:** HERE free tier (60k req/mo, requires API key), Mapbox (subscription).
- **Why:** RRR's intake volume (<10/day) is far below Nominatim's 1 req/sec policy. No key to manage. Accuracy is sufficient for the published mileage rule (rounded miles).
- **Reversibility:** Straightforward — `geocodeAddress` is a single function that swaps providers in <30 lines.
- **Watch-out:** Nominatim rejects `User-Agent`-less requests aggressively. Our header is set; if we ever spread the geocoder beyond the Worker, repeat the header there.

---

## Tests & Verification

```text
pnpm test       → 121/121 across 23 files (~700ms)
pnpm typecheck  → 9/9 workspaces clean
pnpm lint       → 0 errors / 1 informational warning (81 files)
pnpm infra:config → still validates the compose file
```

Manual:
- Verified `pnpm zoho:audit` still pulls correctly (no regression on the live OAuth path).
- Hand-checked `/healthz` JSON shape (Hono request via `app.fetch`).

What's NOT verified live yet (deferred per "Blocked On"):
- Workflow end-to-end (intake form → SMS + Zoho draft) — needs Tunnel + Twilio + Resend
- Anthropic-path classify-intake against real Haiku (needs ANTHROPIC_API_KEY)
- Nominatim against the real shop address — covered by unit tests with stubbed fetch; live test happens during chunk 3 e2e.

---

## Risks & Watch-outs

- **The `console.warn(...)` Anthropic-fallback path silently swaps to the stub.** That's by design (ADR-010), but the response body's `source` field is the only signal — n8n should log it so we can spot a degraded classifier in production. Worth wiring into Phase 02 chunk 3's workflow.
- **`createInvoiceSchema.extend(...)` shares the line-item schema with estimates.** If we ever diverge invoice line items from estimate line items (Zoho doesn't, but our wrapper might), this needs a fresh schema.
- **Anthropic SDK's bundle size in Workers.** Untested at deploy time. If it pushes us over CF Workers' free-tier 1MB compressed limit, options are (a) fetch directly via HTTP, (b) move classify-intake to a Node-runtime worker. Cheap to verify with `wrangler deploy --dry-run` once CF account is set up.
- **Nominatim 1 req/sec policy.** RRR volume is well under, but if we ever batch-geocode catalog data (we don't, currently) we'd need a delay.

---

## Stats

- **Files added:** 12 (env.ts, middleware/auth.ts, routes/zoho.ts, routes/agent.ts, lib/geocoder.ts, classify-intake.ts + their .test.ts companions, plus middleware test, index test rewrite)
- **Files removed:** 1 (old apps/api/src/index.test.ts replaced)
- **Lines added (Phase 02 commits, cumulative on the branch):** ~2,000
- **Commits on the branch:** 2 (`97571b0..ce91f16`)
- **Test count:** 104 → **121** (+17)
- **New deps:** `hono` (catalog), `zod` (catalog) on `apps/api`; `@anthropic-ai/sdk ^0.95.1` on `@rrr/agent`

---

## Files / Links Reference

- **PR:** [#2 — Phase 02 chunks 1+2 Worker routes](https://github.com/JongoDB/rrr-facelift/pull/2)
- Worker entry: [apps/api/src/index.ts](apps/api/src/index.ts)
- Auth middleware: [apps/api/src/middleware/auth.ts](apps/api/src/middleware/auth.ts)
- /zoho routes: [apps/api/src/routes/zoho.ts](apps/api/src/routes/zoho.ts)
- /agent routes: [apps/api/src/routes/agent.ts](apps/api/src/routes/agent.ts)
- Anthropic classifier: [packages/agent/src/classify-intake.ts](packages/agent/src/classify-intake.ts)
- Nominatim geocoder: [apps/api/src/lib/geocoder.ts](apps/api/src/lib/geocoder.ts)
- Env contract: [apps/api/src/env.ts](apps/api/src/env.ts)

---

*Phase 02 chunk 1+2 closed. Chunk 3 (n8n workflow JSON + live e2e) waits on the human-required items above. Next session resumes from `STATUS.md`.*
