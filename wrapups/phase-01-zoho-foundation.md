# Phase 01 — Service Catalog + Zoho Integration — Wrap-up

> **For the human owner.** Read top to bottom; everything below "Delivered" is supporting detail.

**Phase status:** ✅ complete (all locally-verifiable deliverables in place; live `[TEST]`-tagged integration sweep deferred to a Phase-02 sanity step)
**Date:** 2026-05-08
**Branch / PR:** `phase-01/zoho-foundation` → [PR #1](https://github.com/JongoDB/rrr-facelift/pull/1)
**Time spent:** ~2 sessions

---

## TL;DR

A typed Zoho Books client with caching OAuth, retrying `zohoFetch`, and 17 typed tool methods covering every Phase-02 / Phase-04 need. Catalog source-of-truth flipped per audit findings — Zoho is canonical, our local catalog is a 363-item generated mirror with derived keywords / units / ids. Two new planning docs (14 + 15) capture the schema and the existing Zoho Flow that's being replaced. 69 unit tests, all green. Ready for Phase 02 (n8n + intake workflow).

---

## Delivered

### Foundation (zoho-tools package)

- [x] **OAuth helper with token cache and inflight-mint coalescing** — [packages/zoho-tools/src/auth.ts](packages/zoho-tools/src/auth.ts), [client.ts](packages/zoho-tools/src/client.ts). Refreshes ~60s before expiry; concurrent callers share a single inflight mint.
- [x] **Region-aware `zohoFetch`** — [fetch.ts](packages/zoho-tools/src/fetch.ts). Auto-injects bearer + `organization_id`, retries on 429/5xx with exponential backoff + jitter, throws structured `ZohoApiError` (status, path, attempts, body) on hard failures.
- [x] **`createZohoClient(config)` factory** — [client.ts](packages/zoho-tools/src/client.ts) — exposes 17 typed methods, no manual context plumbing for callers.

### Tools (every entry from planning/06 except the two flagged below)

| Tool (planning/06) | Helper | File |
|--------------------|--------|------|
| `lookup_customer` | `searchContacts` (defaults to `last_modified_time DESC`), `getContact` | [contacts.ts](packages/zoho-tools/src/contacts.ts) |
| `create_customer` | `createContact` (canonical individual / Due-on-Receipt / SMS-enabled payload, RV info → `notes`) | [contacts.ts](packages/zoho-tools/src/contacts.ts) |
| `get_customer_history` | `getContactHistory` (merges `/invoices` + `/estimates`, sorts by date DESC, applies limit) | [contacts.ts](packages/zoho-tools/src/contacts.ts) |
| `search_items` | `listItems` / `listAllItems` (catalog mirror is the actual lookup target — see below) | [items.ts](packages/zoho-tools/src/items.ts) |
| `create_estimate` | `createEstimate` (verbatim warranty + quote terms defaults, draft by default, `?send=true` to email immediately) | [estimates.ts](packages/zoho-tools/src/estimates.ts) |
| `add_lines_to_estimate` | `addLinesToEstimate` (fetch + PUT merged list — Zoho's only way to amend a draft) | [estimates.ts](packages/zoho-tools/src/estimates.ts) |
| `create_invoice` | `createInvoice` (Due-on-Receipt + verbatim invoice notes/terms) | [invoices.ts](packages/zoho-tools/src/invoices.ts) |
| `convert_estimate_to_invoice` | `convertEstimateToInvoice` | [invoices.ts](packages/zoho-tools/src/invoices.ts) |
| `record_payment` | `recordPayment` (maps PaymentMethod → Zoho `payment_mode` label; partial application across invoices) | [payments.ts](packages/zoho-tools/src/payments.ts) |
| **`add_internal_comment`** | `addInternalComment` (`show_comment_to_clients=false`) | [comments.ts](packages/zoho-tools/src/comments.ts) |
| **`add_customer_comment`** | `addCustomerComment` (`show_comment_to_clients=true`) | [comments.ts](packages/zoho-tools/src/comments.ts) |
| **`get_internal_comments`** | `listInternalComments` (filters out system + customer types) | [comments.ts](packages/zoho-tools/src/comments.ts) |
| **`buildIntakeTemplate`** (helper) | Verbatim Jonathan-template formatter for Phase 02 intake workflow | [comments.ts](packages/zoho-tools/src/comments.ts) |
| `calculate_mileage_fee` | ⏳ **deferred** — needs geocoder env config (Nominatim or HERE) wired up; planned for Phase 02 prep |
| `send_document` | ⏳ **deferred** — needs Resend customer-email template wired up; planned for Phase 04 |

### Catalog (service-catalog package)

- [x] **`pnpm sync:catalog`** — [scripts/sync-zoho-catalog.ts](scripts/sync-zoho-catalog.ts). Pulls the live items list from the audit OAuth context and emits `catalog.generated.ts` (~104 KB).
- [x] **363-item generated mirror** at [packages/service-catalog/src/catalog.generated.ts](packages/service-catalog/src/catalog.generated.ts). Each entry has the canonical Zoho id, parsed unit, derived `kind` + `category`, and a starter set of AI-extraction keywords.
- [x] **`derive.ts` pure functions** — [derive.ts](packages/service-catalog/src/derive.ts) — `slugify`, `deriveId`, `deriveKind`, `deriveCategory`, `deriveUnit`, `deriveKeywords`, `deriveCatalogItem`. 15 unit tests cover the rules (e.g. `Parts - Roof membrane (per linear ft)` → `parts.roof_membrane`, `unit: 'linear_ft'`).
- [x] **`findById` + `findByZohoItemId` round-trip** — [catalog.ts](packages/service-catalog/src/catalog.ts) — Phase 04 tools and the cached-Postgres-items table both need both directions.
- [x] **`QUOTE_RULES.taxRate = 0.0675`** with a comment that Zoho is the system of record for tax application.

### Catalog source-of-truth direction reversed

Pre-audit Phase 01 plan was to PUSH our placeholder catalog to Zoho. After the audit (planning/14) confirmed Zoho already carries 364 mature items with real rates, the direction flipped — see commit `8310543` and updated [planning/05-service-catalog.md](planning/05-service-catalog.md). Owner re-typing zero rates would have been pointless busywork.

### Discovery / planning artefacts

- [x] **[planning/14-zoho-org-schema.md](planning/14-zoho-org-schema.md)** — schema discovered from the live audit (item naming as schema, no custom fields, comment-type semantics, intake template, mobile-pricing duality, RV info in `notes`).
- [x] **[planning/15-zoho-flow-current.md](planning/15-zoho-flow-current.md)** — what's running in Zoho Flow today, scoped to **Intake Automation** only per owner direction (Appointment Automation is out of scope for migration).
- [x] **CLAUDE.md** auto-imports both new docs.
- [x] **planning/06** updated with comment-type semantics, intake-template format, and mobile-pricing duality.

### Test surface

- 17 unit-test files, **69 passing** total (up from 19 at end of Phase 00).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm infra:config` all green locally.
- CI green on `main`; PR will trigger CI again on `phase-01/zoho-foundation`.

---

## Blocked On (Human Required)

| # | Item | Why |
|---|------|-----|
| 1 | **Review + merge PR** — `phase-01/zoho-foundation` → `main` | Owner's call on whether to squash-merge or keep individual commits. |
| 2 | **Sandbox-vs-production decision for live integration tests** | Once merged, an integration sweep of the tool helpers against your real Zoho org will create + delete a few records tagged `[TEST]`. Confirm OK to do that against production, or defer until you provision a Zoho sandbox. |
| 3 | **Shop address** for `SHOP_ADDRESS` / `SHOP_LATITUDE` / `SHOP_LONGITUDE` env vars (Phase 02 mileage calc) — same ask as Phase 00 wrap-up. |

Nothing in this list blocks Phase 02 starting on a separate branch — only #1 needs to land before merging Phase 02 work.

---

## Recommended Next

- **Proposed:** **Phase 02 — n8n self-hosted + Intake Form workflow** ([planning/04-phases.md#phase-02](planning/04-phases.md))
- **Rationale:** Tool surface is in place. The natural next chunk is bringing up the Docker stack (n8n, Postgres, Speaches, Caddy, cloudflared), wiring the `02-process-intake-form` workflow per [planning/15](planning/15-zoho-flow-current.md) (replicating the live Intake Automation but with the cleaner architecture noted in that doc), and exposing Worker endpoints `apps/api` calls for Zoho ops.
- **Estimated effort:** 2 sessions per planning estimate.
- **Prerequisites:** Items #2 (sandbox-or-prod confirmation) and #3 (shop address) above. Cloudflare Tunnel cert + Twilio number purchase are also Phase-02 owner actions.

---

## Defer List

| Item | Reason | Phase to revisit |
|------|--------|------------------|
| `calculate_mileage_fee` tool | Needs geocoder env config (Nominatim free or HERE free-tier key) | Phase 02 prep |
| `send_document` tool | Needs Resend customer-email template wired up | Phase 04 |
| Drizzle migrations + `pnpm sync:items` (Postgres cache) | Postgres isn't running yet — depends on the Docker stack | Phase 02 |
| Live integration smoke against the real Zoho org | Needs explicit owner sign-off + a `[TEST]` cleanup script | Phase 02 prep |
| Anthropic SDK + agent loop | Out of scope for Phase 01 (Phase 02/04) | Phase 02 (intake classifier — Haiku) and Phase 04 (chat — Sonnet) |
| `appliance.*` and other category-specific catalog overlays | Zoho's catalog already covers them via `Parts -` and `Labor -` items | Phase 04/05 if voice extraction needs richer keyword overlays |

---

## Decisions Made

### ADR-005: Catalog source-of-truth flipped to Zoho-canonical (RECORDED)

- **Decision:** `pnpm sync:catalog` PULLS items from Zoho into a generated TS mirror. Local edits live only in derived fields (keywords / unit / id / category), never round-tripped.
- **Alternatives considered:** Original Phase 01 plan to PUSH placeholder catalog to Zoho.
- **Why:** Audit (planning/14) revealed 364 mature items already exist with real rates and an established naming convention that *is* the schema. Pushing our 22 placeholders would have introduced duplicate items or required the owner to re-type prices that already exist.
- **Reversibility:** Easy — `derive.ts` is the only thing that knows the direction; flipping back is a script-day's work if Zoho ever becomes a write-target instead.
- **Doc impact:** [planning/05-service-catalog.md](planning/05-service-catalog.md) updated with a banner; full rationale in [planning/14](planning/14-zoho-org-schema.md).

### ADR-006: Verbatim warranty + terms text reused on every doc (NEW)

- **Decision:** New estimates and invoices default to the exact warranty / terms strings RRR already uses today. Captured in [packages/zoho-tools/src/templates.ts](packages/zoho-tools/src/templates.ts).
- **Alternatives considered:** Generate fresh terms per document, or omit defaults entirely.
- **Why:** Customers will read invoices generated by the new flow side-by-side with old ones. Identical legal copy keeps the experience seamless and avoids "why does this look different?" support questions.
- **Reversibility:** Trivial — single-file edit; takes effect on next-created doc.

### ADR-007: `searchContacts` defaults to recency ranking (NEW)

- **Decision:** When the tech types a partial customer name in the field, `searchContacts` returns matches ranked by `last_modified_time DESC`.
- **Alternatives considered:** Alphabetical sort, outstanding-balance descending, name-match-score.
- **Why:** "What did we just do for them?" is the dominant tech-in-the-field UX. Recency hits that question without an extra LLM scoring call.
- **Reversibility:** Trivial — caller can pass `sort_column` to override per-call.

### ADR-008: Zoho Flow Appointment Automation is out of scope (NEW per owner)

- **Decision:** Phase 02 builds nothing for the Appointment Automation flow. Only Intake Automation is being migrated.
- **Why:** Owner direction (2026-05-08). Future appointment handling will route through the customer portal or the new tech PWA, not via inbound email parsing.
- **Reversibility:** Easy — a dedicated phase later if needed.

---

## Tests & Verification

```text
pnpm test       → 69/69 across 17 files (~700ms)
pnpm typecheck  → 7/7 workspaces clean
pnpm lint       → 0 errors / 0 warnings (69 files)
pnpm infra:config → still validates (unchanged)
git status      → clean on phase-01/zoho-foundation
```

Manual verification:
- `pnpm zoho:audit` against the live org succeeded, dumps in `audit/zoho/` (gitignored).
- `pnpm sync:catalog` regenerates `catalog.generated.ts` deterministically.
- `findByZohoItemId` round-trips on every active item with a Zoho id (asserted in test).

What's NOT verified live yet (deferred):
- Actual `createContact` / `createEstimate` / `createInvoice` against the production org — left until #2 above is resolved. The mocked-fetch tests cover URL shape, body shape, default-application logic, and error propagation, but not Zoho's server-side validation.

---

## Risks & Watch-outs

- **`addLinesToEstimate` does fetch-then-PUT.** If a tech and the owner edit the same draft simultaneously, last-write-wins. Phase 04 PWA UX should warn on conflict; for Phase 02 server-side automation we control both writers so it's safe.
- **`recordPayment` uses Zoho's payment_mode label set.** The mapping I committed is sensible (`card → "Credit Card"`, etc.) but Zoho lets orgs customize this list. If your org has custom payment modes, the labels may drift; we'll catch this on first integration test.
- **OAuth refresh token doesn't auto-rotate.** If revoked, you re-run `pnpm zoho:mint <code>`. Refresh tokens persist indefinitely; access tokens are minted on demand and cached per Worker isolate / per script invocation.
- **Catalog mirror is a snapshot.** `catalog.generated.ts` was committed at sync time; if your Zoho catalog drifts, re-run `pnpm sync:catalog` and commit the diff. Phase 02 introduces an hourly Postgres-backed item sync so PWA always sees current state.

---

## Stats

- **Files added:** 14 (8 source modules + 6 test files; +1 templates module)
- **Lines added (Phase 01 commits, cumulative):** ~1,500 in this branch on top of Phase 00
- **Commits on the branch:** 6 (`8310543..32ee43b`)
- **Test count:** 19 → **69** (+50)
- **Workspaces affected:** `packages/zoho-tools`, `packages/service-catalog`, `scripts/`, `planning/` docs
- **New devDeps:** `tsx ^4.21.0` (catalog) — needed to run typed scripts that import workspace packages

---

## Files / Links Reference

- **PR:** [#1 — Phase 01 Zoho foundation](https://github.com/JongoDB/rrr-facelift/pull/1)
- Tool surface: [packages/zoho-tools/src/](packages/zoho-tools/src/)
- Catalog mirror: [packages/service-catalog/src/catalog.generated.ts](packages/service-catalog/src/catalog.generated.ts)
- Catalog deriver: [packages/service-catalog/src/derive.ts](packages/service-catalog/src/derive.ts)
- Sync script: [scripts/sync-zoho-catalog.ts](scripts/sync-zoho-catalog.ts)
- Schema reference: [planning/14-zoho-org-schema.md](planning/14-zoho-org-schema.md)
- Flow inventory: [planning/15-zoho-flow-current.md](planning/15-zoho-flow-current.md)
- Updated tool-spec doc: [planning/06-zoho-integration.md](planning/06-zoho-integration.md)

---

*Phase 01 closed. Next session resumes from `STATUS.md` after the PR is merged + items #2 and #3 above are unblocked.*
