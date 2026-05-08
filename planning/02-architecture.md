# 02 — Architecture

## High-Level Topology

```
┌──── Cloudflare (free tier) ────────────────────────────────────┐
│                                                                │
│   triple-r-rv.com         → Astro static site (Pages)          │
│   app.triple-r-rv.com     → Tech PWA (Pages + Workers)         │
│   api.triple-r-rv.com     → Workers (Anthropic proxy + auth)   │
│   flows.triple-r-rv.com   → Tunnel → n8n on owner's VM         │
│   stt.triple-r-rv.com     → Tunnel → Speaches (Whisper STT)    │
│                                                                │
│   DNS, SSL, DDoS, CDN — all handled here                       │
└────────────┬───────────────────────────────────────────────────┘
             │  Cloudflare Tunnel (no inbound ports on VM)
             ▼
┌──── Owner's VM / homelab ──────────────────────────────────────┐
│                                                                │
│   Docker Compose stack:                                        │
│     • n8n              (workflow automation, UI on flows.*)    │
│     • speaches         (Whisper STT, OpenAI-compatible API)    │
│     • postgres         (n8n state + cached Zoho item catalog)  │
│     • caddy            (internal reverse proxy)                │
│     • cloudflared      (tunnel client)                         │
│     • ollama           (optional, local LLM for async tasks)   │
│                                                                │
│   Backups: nightly pg_dump → off-site (owner's choice)         │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           │  outbound HTTPS only
                           ▼
┌──── External APIs ─────────────────────────────────────────────┐
│   • Zoho Books (system of record: contacts, items,             │
│                  estimates, invoices, payments)                │
│   • Anthropic API (Claude — tech PWA conversational layer)     │
│   • Twilio (SMS to techs and customers)                        │
│   • Google Workspace (existing — email send via SMTP relay)    │
└────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Marketing site (`triple-r-rv.com`)
- Astro static site, deployed to Cloudflare Pages
- Content as Markdown in the repo (services, pricing, about)
- Intake form posts to `flows.triple-r-rv.com/webhook/intake`
- No JS framework required for most pages; intake form is an Astro island

### Tech PWA (`app.triple-r-rv.com`)
- Installable to home screen (manifest + service worker)
- Auth via magic link (Resend email)
- Two primary flows: **chat-driven** ("create estimate for John") and **voice-driven** (record → transcribe → extract → review → submit)
- Talks to `api.triple-r-rv.com` for the Anthropic proxy and Zoho operations

### API Worker (`api.triple-r-rv.com`)
- Cloudflare Worker (Hono framework)
- Holds Zoho OAuth refresh token (encrypted in Workers secrets)
- Proxies Anthropic API calls (so the API key never touches the browser)
- Implements Claude tool-use loop: when Claude calls a tool, Worker executes the corresponding Zoho operation and returns the result
- Tools defined in `packages/zoho-tools/` — shared between Worker and n8n

### n8n (`flows.triple-r-rv.com`)
- Self-hosted workflow engine, replaces Zoho Flow
- Webhook ingestion (intake form, Zoho Books webhooks, etc.)
- Workflows in `infra/n8n/workflows/*.json` (committed to repo, imported on startup)
- Calls into `api.triple-r-rv.com` for any operation that requires the shared Zoho tool layer

### Speaches (`stt.triple-r-rv.com`)
- OpenAI-compatible `/v1/audio/transcriptions` endpoint
- Whisper-large-v3-turbo if GPU available, medium.en on CPU
- Tech PWA uploads audio directly here; transcript flows back into the Claude tool-use loop in the PWA

### Postgres
- n8n's persistence
- Cached Zoho items table (sync hourly via n8n) for fast catalog lookup in the PWA
- Magic link tokens for tech auth
- Audit log of tool calls (for debugging and improvement)

## Data Flow: Customer Intake

```
1. Customer fills form on triple-r-rv.com
2. Browser → POST flows.triple-r-rv.com/webhook/intake
3. n8n workflow:
   a. Validate payload
   b. Call api.triple-r-rv.com/zoho/upsert-contact (creates or updates Zoho contact)
   c. Call Anthropic API (via api.*) to summarize + classify
   d. If mobile: calculate mileage from shop address using cached geocode
   e. Create Zoho draft estimate with classified line items
   f. Send Twilio SMS to owner/tech with summary + deep link
   g. Send confirmation email to customer
4. n8n returns 200 to browser with confirmation
```

## Data Flow: Voice → Estimate

```
1. Tech opens app.triple-r-rv.com (PWA), authenticates
2. Selects customer (autocomplete pulls from cached Zoho contacts)
3. Taps mic, speaks job description, taps stop
4. Browser → POST stt.triple-r-rv.com/v1/audio/transcriptions → transcript
5. Browser → POST api.triple-r-rv.com/chat with system prompt + transcript
   - System prompt includes the cached service catalog
   - Tools: lookup_customer, search_items, create_estimate, etc.
6. Claude returns tool_use blocks; Worker executes each, feeds results back
7. Final response to PWA: structured estimate proposal (line items, totals)
8. Tech reviews, edits qty/rate inline, taps "Create Estimate"
9. Browser → POST api.triple-r-rv.com/zoho/create-estimate → Zoho Books API
10. Zoho returns estimate ID + PDF URL → PWA shows success + send-to-customer button
```

## Data Flow: Review Request Automation

```
1. Zoho Books fires webhook on invoice.paid → flows.triple-r-rv.com/webhook/zoho/invoice-paid
2. n8n workflow:
   a. Wait 24 hours
   b. Look up customer's contact preferences
   c. Send SMS with Google review link + reminder of 10% discount offer
   d. Log in Postgres for follow-up tracking
```

## Trust Boundaries

- **Browser ↔ Worker:** Auth via signed JWT (issued by Worker after magic link). Worker is the only thing that knows Anthropic and Zoho keys.
- **Worker ↔ n8n:** Mutual auth via shared secret in headers. n8n only accepts requests from Worker IP range or with valid HMAC.
- **n8n ↔ Zoho:** OAuth2 refresh token stored in n8n credentials (encrypted at rest by n8n).
- **Zoho ↔ n8n webhooks:** Verify Zoho webhook signature on every inbound call.

## Failure Modes and Fallbacks

| Failure | User-visible effect | Mitigation |
|---------|---------------------|------------|
| Speaches down | Tech can't transcribe | PWA falls back to text input mode |
| Anthropic API down | Tech app can't reason about line items | PWA shows the cached service catalog and lets tech build estimate manually |
| Zoho Books down | Estimates can't be created | PWA queues estimates locally, retries when API responds |
| n8n down | Forms succeed but no notifications | Form submissions logged to Postgres directly via Worker; n8n replays on startup |
| Cloudflare Tunnel down | n8n + Speaches unreachable | Tech PWA falls back to text mode + manual line items; intake form returns "we'll call you back" |

## What's Deliberately Simple

- **No microservices.** One Worker, one PWA, one n8n, one Postgres.
- **No event bus.** Direct HTTPS calls. Postgres + n8n's own queue handle async.
- **No service mesh / k8s.** Docker Compose on a single VM is enough for this scale.
- **No staging environment.** Use feature branches + Cloudflare preview deployments. A staging Zoho org is more trouble than it's worth — use Zoho's sandbox feature when needed.
