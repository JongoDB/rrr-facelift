# 04 — Phase Plan

7 phases. Each is sized to a focused work session, with explicit exit criteria. Claude Code does not start phase N+1 until phase N's exit criteria are checked.

---

## Phase 00 — Foundation

**Goal:** Repo, infra skeleton, credentials checklist established. No business logic yet.

**Deliverables:**
- [ ] Monorepo initialized per `planning/03-tech-stack.md` layout (`apps/`, `packages/`, `infra/`, `scripts/`)
- [ ] pnpm workspaces configured, `pnpm install` runs clean
- [ ] Biome configured at root with project conventions
- [ ] Vitest + Playwright configured at root, smoke tests pass
- [ ] GitHub repo created, CI runs Biome + Vitest on PR
- [ ] `infra/docker-compose.yml` skeleton committed (services declared, no real workflows yet)
- [ ] `.env.example` files in every app/package with placeholder values
- [ ] All entries in `planning/13-secrets-manifest.md` either provided by human or stubbed

**Exit Criteria:**
- `pnpm install && pnpm test && pnpm lint` succeeds
- `docker compose -f infra/docker-compose.yml config` parses without error
- CI green on initial commit

**Human Required:** GitHub org/repo decision, Cloudflare account access (or token), VM SSH/Docker access confirmed, Anthropic API key, Zoho OAuth client ID/secret, Twilio account decision, Resend account, domain registrar access for Cloudflare nameserver migration.

**Estimated effort:** 1 session

---

## Phase 01 — Service Catalog + Zoho Integration

**Goal:** Codify RRR's service catalog. Build the shared Zoho tool layer (`packages/zoho-tools`) that every other component will use.

**Deliverables:**
- [ ] `packages/service-catalog/` — typed catalog (services, standard parts, pricing rules) per `planning/05-service-catalog.md`
- [ ] Seed script populates Zoho Books items from the catalog (idempotent — safe to re-run)
- [ ] `packages/zoho-tools/` — OAuth flow helper, refresh token management, all tool functions per `planning/06-zoho-integration.md`
- [ ] Each Zoho tool has unit tests with mocked HTTP responses
- [ ] Postgres schema for cached items, audit log, magic-link tokens (Drizzle migrations)
- [ ] Hourly Zoho item sync as a script (will become an n8n workflow in Phase 02)

**Exit Criteria:**
- `pnpm seed:catalog` populates Zoho Books with all defined items (idempotent)
- `pnpm sync:items` pulls Zoho items into local Postgres cache
- All `packages/zoho-tools/` functions have ≥80% test coverage
- `lookup_customer`, `search_items`, `create_estimate` (draft), `create_invoice` (draft) work against owner's Zoho org via integration test (using Zoho sandbox or owner's real org with `[TEST]` tagged records)

**Human Required:** Zoho OAuth refresh token (initial generation requires browser login). Confirmation that seeding the service catalog into the live Zoho org is okay (or pointer to sandbox).

**Estimated effort:** 1-2 sessions

---

## Phase 02 — n8n + First Workflow (Intake Form)

**Goal:** n8n self-hosted, Cloudflare Tunnel exposing it, first workflow live: intake form → SMS + Zoho draft.

**Deliverables:**
- [ ] `infra/docker-compose.yml` complete: n8n, postgres, speaches, caddy, cloudflared all start
- [ ] Cloudflare Tunnel configured for `flows.triple-r-rv.com` and `stt.triple-r-rv.com`
- [ ] n8n bootstrapped with workflows imported from `infra/n8n/workflows/*.json` on container start
- [ ] **Intake form workflow** built per `planning/07-n8n-workflows.md`:
  - Webhook receives form submission
  - Validates payload (zod-equivalent in n8n)
  - Calls API Worker `/zoho/upsert-contact`
  - Calls API Worker `/agent/classify-intake` (Claude Haiku — cheap classifier)
  - Calculates mileage if mobile
  - Creates Zoho draft estimate
  - Sends Twilio SMS to owner
  - Sends confirmation email to customer via Resend
- [ ] **Item sync workflow:** hourly cron pulls Zoho items → Postgres cache
- [ ] API Worker (`apps/api/`) has `/zoho/*` endpoints used by n8n
- [ ] Test intake submission end-to-end works against owner's Zoho org

**Exit Criteria:**
- `docker compose up` brings the stack live
- `curl https://flows.triple-r-rv.com/webhook/intake -d '...'` produces SMS within 60s and a Zoho draft estimate
- n8n UI reachable at `https://flows.triple-r-rv.com` with auth
- Hourly item sync runs and updates Postgres

**Human Required:** Set up Cloudflare Tunnel cert (one-time `cloudflared tunnel login`). Confirm Twilio number purchase. Provide owner's mobile number for SMS.

**Estimated effort:** 2 sessions

---

## Phase 03 — Website Migration to Astro / Cloudflare Pages

**Goal:** Replace Squarespace with a self-hosted Astro site. Intake form posts to n8n.

**Deliverables:**
- [ ] Run `scripts/snapshot-squarespace.mjs` to grab all current page content + screenshots for reference
- [ ] `apps/web/` Astro project with pages: `/`, `/services`, `/pricing`, `/about`, `/discounts`, `/contact`, `/intake`
- [ ] Content migrated from snapshots into Markdown files under `apps/web/content/`
- [ ] Branching intake form (`/intake`) with mobile vs on-site routing per `planning/09-website-migration.md`
- [ ] Form posts to `flows.triple-r-rv.com/webhook/intake`
- [ ] Site deploys to Cloudflare Pages on every push to `main`
- [ ] Preview deploys for branches
- [ ] Lighthouse score ≥95 on all key pages (mobile + desktop)
- [ ] Sitemap, robots.txt, basic SEO metadata in place

**Exit Criteria:**
- Site renders correctly at preview URL
- Submitting intake form on preview triggers SMS + Zoho draft (same as Phase 02)
- Owner has reviewed all page content and approved/edited
- DNS cutover plan documented

**Human Required:** Review and edit all migrated copy (only the owner knows the brand voice). Approve final design. **Approve DNS cutover** — this is the production go-live moment, requires explicit go-ahead.

**Estimated effort:** 1-2 sessions + human review cycle

---

## Phase 04 — Tech PWA: Chat + Zoho Tool Use

**Goal:** Tech can open `app.triple-r-rv.com` on phone, log in via magic link, chat with Claude to look up customers, view past jobs, create estimates and invoices via natural language. No voice yet.

**Deliverables:**
- [ ] `apps/tech-pwa/` Vite + React app per `planning/08-tech-pwa-spec.md`
- [ ] PWA manifest + service worker for installability
- [ ] Magic-link auth flow (Resend → JWT cookie via API Worker)
- [ ] Chat UI with streaming responses, tool-call rendering (shows what Claude is doing)
- [ ] API Worker `/agent/chat` endpoint runs Claude tool-use loop with full Zoho toolset
- [ ] All tools from `planning/06-zoho-integration.md` wired up and tested
- [ ] Customer autocomplete from cached Zoho contacts
- [ ] Estimate/invoice review screens — tech can edit line items before submission
- [ ] Send-to-customer button (email + optional SMS)
- [ ] Deploys to `app.triple-r-rv.com` (Cloudflare Pages)

**Exit Criteria:**
- Owner installs PWA on phone, logs in via email magic link
- Says: "create estimate for John Smith, 2 hours of roof reseal" → Claude looks up John, creates draft estimate with correct line items, returns confirmation
- Same for invoices
- All tool calls logged in Postgres audit table

**Human Required:** Test the actual flow on the actual phone. Provide feedback on UI/UX. Decide on send-to-customer wording. Confirm test data is acceptable in Zoho.

**Estimated effort:** 2-3 sessions + UX iteration

---

## Phase 05 — Tech PWA: Voice → Line Items

**Goal:** Tech speaks naturally, the system extracts structured line items from the transcript, tech reviews and submits.

**Deliverables:**
- [ ] Mic button in PWA using `MediaRecorder` API
- [ ] Audio uploaded to `stt.triple-r-rv.com/v1/audio/transcriptions` (Speaches)
- [ ] Transcript fed into Claude tool-use loop with augmented system prompt:
  > "You are receiving a verbal description of completed RV service work. Extract line items mapping to the service catalog. Confirm ambiguous items with the tech before creating documents."
- [ ] Suggested line items rendered with confidence indicators; tech can edit qty/rate/description
- [ ] Single button creates estimate OR invoice (tech selects beforehand)
- [ ] Voice flow tested with real RRR-domain dictation samples (synthesized or recorded)
- [ ] Latency target: speech end → line items shown in <8 seconds on owner's network

**Exit Criteria:**
- Owner records a voice note describing a typical job. Within 8 seconds, line items appear on screen mapped to correct catalog items, with sensible quantities. Tap-edit-submit produces a Zoho estimate matching the spoken intent.
- Speaches latency profiled and documented (CPU vs GPU performance characteristics noted for future)

**Human Required:** Voice testing with actual job descriptions. Catalog tuning — owner inevitably finds gaps in the catalog when speaking naturally; iterate.

**Estimated effort:** 2 sessions + tuning

---

## Phase 06 — Polish & Expansion

**Goal:** Cancel paid subscriptions, automate review requests, add nice-to-haves identified along the way.

**Deliverables:**
- [ ] Review request workflow in n8n: Zoho `invoice.paid` webhook → wait 24h → Twilio SMS with Google review link + 10% discount reminder
- [ ] Optional: customer status portal at `triple-r-rv.com/jobs/<token>` (read-only view of estimate/invoice status)
- [ ] Optional: parts-arrived follow-up workflow (when ordered part arrives, auto-text customer to schedule install)
- [ ] Backup automation: nightly `pg_dump` to off-site (S3-compatible, owner picks: Cloudflare R2 free tier, etc.)
- [ ] Uptime monitoring (UptimeKuma in the Docker stack, or Better Uptime free tier)
- [ ] Owner cancels Squarespace subscription (DNS already migrated in Phase 03)
- [ ] Owner cancels Zoho Flow subscription (workflows fully migrated in Phase 02)
- [ ] Documentation pass: every package has a README, every n8n workflow has notes

**Exit Criteria:**
- Reviewing the project, owner can confidently say: "another contractor could pick this up cold."
- Both subscriptions cancelled.
- 7 consecutive days without any error in monitoring (post-cutover stability).

**Human Required:** Cancel old subscriptions. Choose backup destination. Decide on future enhancements vs ship-it-and-stop.

**Estimated effort:** 1-2 sessions

---

## When Things Go Sideways

If a phase reveals that an earlier decision was wrong:

1. Don't unilaterally change `planning/03-tech-stack.md`. Write an ADR proposal in the wrap-up.
2. Quantify the cost of staying the course vs switching.
3. Wait for human approval before refactoring.

If a phase keeps growing in scope:

1. Stop adding to it.
2. Move new ideas to the **Defer List** in the wrap-up.
3. Ship what's done. The point is forward motion, not perfection.
