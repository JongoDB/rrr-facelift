# 07 — n8n Workflow Inventory

> All workflows are committed as JSON in `infra/n8n/workflows/` and imported on n8n container start. Hand-edits in the n8n UI must be exported back to the repo.

## Conventions

- **Workflow names:** `<phase>-<verb>-<subject>`, kebab-case (e.g., `02-process-intake-form`)
- **Webhook paths:** `/webhook/<workflow-purpose>` — short, stable, no version numbers (use new paths if breaking changes needed)
- **Credentials:** Defined once in n8n, referenced by name. Names match `planning/13-secrets-manifest.md`.
- **Error handling:** Every workflow has an Error Trigger sub-flow that posts to `#alerts` (or owner SMS via Twilio) with the workflow name and error message
- **Idempotency:** Webhooks include a request ID; first node checks Postgres for prior processing and short-circuits if seen

## Phase 02 Workflows

### `02-process-intake-form`

**Trigger:** Webhook `POST /webhook/intake`

**Input:** Customer-submitted intake form payload:
```typescript
{
  request_id: string;            // client-generated UUID
  service_type: 'mobile' | 'shop';
  customer: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address?: { street; city; state; zip };  // required for mobile
  };
  rv: {
    year: number;
    make: string;
    model: string;
    length_ft?: number;
  };
  problem_description: string;
  photos?: string[];             // R2 URLs after browser upload
  preferred_window: string;      // free text or enum
  emergency: boolean;
  consent_sms: boolean;
}
```

**Steps:**
1. **Validate** — zod-like check via Code node; reject with 400 if invalid
2. **Dedupe** — check Postgres `intake_submissions` for `request_id`; if seen, return 200 (idempotent)
3. **Upsert contact** — `POST {API}/zoho/upsert-contact` with customer + RV info as custom fields
4. **AI classify** — `POST {API}/agent/classify-intake` (uses Claude Haiku):
   - Returns: `{ category, suggested_items: [{catalog_id, qty}], summary, urgency }`
5. **Calculate mileage** — if mobile: `POST {API}/agent/calculate-mileage` with destination address
6. **Create draft estimate** — `POST {API}/zoho/create-estimate` with suggested items + mileage if applicable, status=draft
7. **Send tech SMS** — Twilio node, message:
   ```
   New {emergency?'EMERGENCY ':''}intake: {customer.last_name} ({rv.year} {rv.make})
   {summary}
   {category} — est. ${total}
   {mileage?` ({miles}mi mobile)`:''}
   View: {APP_URL}/jobs/{estimate_id}
   ```
8. **Send customer email** — Resend node, friendly confirmation with what to expect next
9. **Log** — write to `intake_submissions` table with all IDs

**Output:** 200 `{ ok: true, estimate_id }`

### `02-sync-zoho-items`

**Trigger:** Cron — every hour

**Steps:**
1. `GET {API}/zoho/items?modified_since=<last_sync>`
2. Upsert each into Postgres `items` cache
3. Update `meta.last_item_sync` timestamp

Handles add/update/archive — `archived` flag respected so deleted Zoho items are hidden in PWA pickers but historical line item IDs remain valid.

### `02-error-handler` (sub-workflow)

Triggered by other workflows on error. Posts SMS to owner with workflow + error excerpt + first 200 chars of input payload (PII-redacted).

---

## Phase 06 Workflows (Polish)

### `06-request-review-after-payment`

**Trigger:** Webhook `POST /webhook/zoho/invoice-paid` (Zoho Books fires)

**Steps:**
1. Verify Zoho HMAC signature
2. Look up customer email/phone + the invoice details
3. **Wait 24 hours** (n8n native wait node — survives restarts)
4. Check that no review request has already been sent (look up `review_requests` table)
5. Send Twilio SMS with Google review URL + reminder of 10% off next service
6. Log in `review_requests` table

### `06-parts-arrived-followup`

**Trigger:** Webhook `POST /webhook/parts-arrived` (manual — owner clicks button in some UI, or sent from email parser)

**Steps:**
1. Look up customer + the open job
2. Send SMS: "Hey {first_name}, the parts for your {rv.make} are in. We've got availability {next_3_dates}. Reply with which works best."
3. Update job status in Zoho custom field

### `06-followup-stale-estimates`

**Trigger:** Cron — daily at 10am

**Steps:**
1. Query Zoho for estimates in `sent` status older than 7 days
2. For each, send a polite follow-up email via Resend
3. Cap at 2 follow-ups per estimate (track in `estimate_followups` table)

### `06-zoho-estimate-accepted`

**Trigger:** Webhook `POST /webhook/zoho/estimate-accepted`

**Steps:**
1. Verify HMAC
2. SMS owner: "{customer} accepted estimate #{number} for ${total}. Schedule the job."
3. Optionally create a Google Calendar event in owner's calendar (placeholder — implement if owner wants)

### `06-zoho-estimate-declined`

**Trigger:** Webhook `POST /webhook/zoho/estimate-declined`

**Steps:**
1. Verify HMAC
2. SMS owner: "{customer} declined estimate #{number}. Decline reason: {reason or 'none given'}."
3. Log to `declines` table for retro analysis

### `06-nightly-backup`

**Trigger:** Cron — 2am daily

**Steps:**
1. Run `pg_dump` of n8n + cache databases (via SSH node or local exec)
2. Upload to off-site (S3-compatible, e.g., Cloudflare R2)
3. Retain last 14 days
4. Notify owner only on failure

---

## Workflow Development Practice

1. **Build in the n8n UI.** It's faster than authoring JSON.
2. **Export to repo.** `n8n export:workflow --id <id> --output infra/n8n/workflows/<name>.json`
3. **Review the diff.** Workflow JSON is verbose but readable. PR review focuses on structural changes.
4. **Reset on import.** Container startup imports all workflows from the repo; UI changes that aren't exported are wiped on next deploy. This enforces the repo as source of truth.

## Why Not Just Code Everything?

The boundary: n8n owns **integration glue and scheduled tasks**. The API Worker owns **business logic, AI calls, and Zoho operations** (so they're testable, version-controlled, type-safe). n8n calls into the Worker for anything beyond simple HTTP plumbing.

This means workflows stay simple and visual; logic lives in tested code. Don't be tempted to put complex logic in n8n Code nodes — extract it to the Worker.
