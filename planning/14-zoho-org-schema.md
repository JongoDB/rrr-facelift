# 14 — Zoho Books Org Schema (Discovered)

> **Source of truth on what already exists in RRR's Zoho Books org (org_id `817532175`).** Captured by `pnpm zoho:audit` on 2026-05-08 against the live production org. All quantitative claims here come from the raw dumps in `audit/zoho/` (gitignored — contains customer PII).
>
> The locked planning docs (`05-service-catalog.md`, `06-zoho-integration.md`) describe what we will *build*; this doc describes what is *already there* and therefore constrains every design choice that touches Zoho.

## Headline counts

| Entity | Total | Active | Notes |
|--------|-------|--------|-------|
| Items | 364 | 359 | All `item_type=sales`. 21 services, 343 goods. |
| Contacts | 146 | n/a | All `contact_type=customer`, almost all `customer_sub_type=individual`. |
| Estimates | 74 (recent) | mixed | Mostly `draft` / `sent` / `accepted` / `invoiced`. |
| Invoices | 254 (recent) | mixed | Most paid; some `sent` / `overdue`. |
| Sales orders | 0 | — | RRR doesn't use the SO module. |
| Custom fields | 0 across all entities | — | API responds `{"code":9015,"message":"The entity X does not support custom fields."}` for contacts/items/estimates/invoices. **No `cf_*` fields in use anywhere.** |
| Tags / SKUs / item categories | 0 | — | All tag arrays empty; all SKUs blank; `/itemcategories` 404s (not enabled). |

## Org config

- **Name:** RRR Custom RV Services
- **Phone:** 704-267-3330
- **Currency:** USD
- **Time zone:** `America/Knox_IN` (Eastern; functionally same as `America/New_York`)
- **Locale:** `en` / price precision 2
- **One tax configured:** **Sales Tax 6.75%** authority `DOR`. **`is_taxable=true` on 363 of 364 items**, but `tax_id` is blank on every item — Zoho applies the org-level sales tax automatically to every taxable line. Don't set `tax_id` per-line in our writes; trust Zoho's automatic application.

## Items catalog (the real one)

### Naming convention is the categorization

RRR doesn't use Zoho's `tags`, `sku`, `item categories`, or `unit` fields. **Item names are the schema:**

| Name prefix | Count | Type | Meaning |
|-------------|-------|------|---------|
| `Parts - …` | 334 | goods | Physical parts (e.g. `Parts - Roof membrane (per linear ft)`, `Parts - Dometic Penguin AC`) |
| `Labor - …` | 5 in goods + 16 in services | service | Time-billed labor (e.g. `Labor - Mobile Service (Routine)`, `Labor - Roof Reseal`) |
| `Mobile Service Call Fee …` | 2 | service | Trip fees |
| `Sub - …` | 2 | mix | Subcontracted work pass-through |
| `Inspection Fee` | 1 | service | RV inspection |
| `Discount - …` | 2 | goods | Discount pass-through |
| `Convenience Fee (3%)` | 1 (inactive) | service | CC processing |

The few `Labor - …` entries living under `goods` (e.g. `Labor - On-Site Service`) are data drift; they bill identically to the proper `service` entries.

### Units live inside the name

The Zoho `unit` field is **blank on all 364 items**. When a unit matters, it's baked into the item name in parentheses: `Parts - Roof membrane (per linear ft)`, `Parts - Aluminum 0.125 in Square Tubing (per ft)`, `Mobile Service Call Fee (Per Mile) - OVER 10 MILES`. Our local catalog mirror should derive a typed unit from the name during sync; we shouldn't push a structured unit back to Zoho.

### Service items in full (this is the core of voice extraction)

The 21 services define every chargeable activity, every fee, and every service tier. Any line a tech adds is either one of these or a `Parts - …` entry.

| Rate | Status | Item name |
|------|--------|-----------|
| $263 | active | `Labor - Mobile Service (Emergency/After-Hours) (Appointment with Service Call Fee)` — bundled $164/hr labor + $99 service call |
| $228 | active | `Labor - Mobile Service (Routine) (Appointment with Service Call Fee)` — bundled $129/hr labor + $99 service call |
| $164 | (implicit) | Emergency mobile labor rate (not a standalone item; lives inside the bundled item description) |
| $149 | active | `Labor - Axle Service` |
| $129 | active | `Labor - Mobile Service (Routine)` — labor only, 1-hr minimum |
| $129 | active | `Labor - On-Site Service` (shop-based labor; same rate as routine mobile) |
| $99 | active | `Labor - Systems Check` |
| $99 | active | `Labor - Winterization/Dewinterization` (parts cost included per description) |
| $99 | active | `Mobile Service Call Fee (Flat Rate) - 10 MILES` |
| $39 | active | `Labor - Roof Peel & Seal` ("Starting at $39") |
| $29 | active | `Labor - Roof Reseal` ("Starting at $29") |
| $20 | active | `Labor - Tire Installation` ($20 per tire) |
| $15 | active | `Inspection Fee` |
| $2.70 | active | `Mobile Service Call Fee (Per Mile) - OVER 10 MILES` |
| $0 | active | `Labor - NO CHARGE` (warranty / goodwill) |
| $0 | active | `Sub - Parts/Labor` (subcontracted pass-through, rate filled in per-line) |
| $1713.58 | active | `Parts - Coleman Mach 15,000 BTU rooftop air conditioner …` (filed under services by mistake) |
| $600.76 | active | `Sub - Power steering / hydro boost repair (including new belts)` |
| $124 each | inactive | `Labor - Electrical/Mechanical/Plumbing Diag/Repair` (deprecated; use `Labor - On-Site Service` now) |
| $159 | inactive | `Labor - Mechanical Diag/Repair AFTER HOURS` (deprecated) |
| — | inactive | `Convenience Fee (3%)` |

### Two pricing modes for mobile service

This is the most important pattern in the whole catalog:

**Bundled (1-hour appointment):**
> One line: `Labor - Mobile Service (Routine) (Appointment with Service Call Fee)` qty=1 rate=$228
>
> Description includes appointment time and a payment-before-appointment disclaimer. Used for fixed scheduled appointments where the customer paid in advance.

**Itemized (variable-time work):**
> Three lines:
> 1. `Labor - Mobile Service (Routine)` qty=N hours rate=$129
> 2. `Mobile Service Call Fee (Flat Rate) - 10 MILES` qty=1 rate=$99
> 3. `Mobile Service Call Fee (Per Mile) - OVER 10 MILES` qty=miles_over_10 rate=$2.70 (only when applicable)
>
> Used for actual work-in-progress estimates and invoices.

**Implication for the voice flow:** Claude's prompt needs to choose the bundled vs itemized form based on tech intent. Default heuristic — if tech says "1-hour appointment" or describes a scheduled service call, use bundled; if tech describes actual work duration, use itemized.

## Contacts

### RV info lives in `notes` as free text

The `notes` field on each customer carries the RV. Format is loose human freeform; common patterns from the sample:

```
"2016 Ace f53 chassis"
"2020 coachman freedom express 323bhds, 37"
"2008 keystone outback, 22ft"
"2007 Ford motorhome, 31"
```

Sometimes year + make + model + length, sometimes just chassis info, sometimes empty. **No structure to parse against** — this is the same problem the intake form's `intakeSchema.rv` will handle on the way *in*. On the way *out* (writing back to Zoho), our system should put a structured-but-still-human RV string into `notes`: `"{year} {make} {model}, {length}ft"`.

### Other standard fields used

| Field | Purpose |
|-------|---------|
| `mobile` | Primary contact phone (most populated) |
| `phone` | Often blank; mobile is the working number |
| `email` | Always populated |
| `billing_address` | Street/city/state/zip + optional `attention`/`street2` |
| `is_sms_enabled` | RRR tracks SMS opt-in here. Default `true`. |
| `notes` | RV info (free text — see above) |
| `documents` | Attached photos / screenshots from intake (e.g. data tag photos) |
| `payment_terms_label` | "Due on Receipt" universally |
| `customer_sub_type` | `individual` for almost all customers |

`custom_fields: []` and `custom_field_hash: {}` on every contact — confirms no extension fields anywhere.

## Estimates and invoices

### Document numbering

- Estimates: `QT-NNNNNN` (e.g. `QT-000117`)
- Invoices: `INV-NNNNNN` (e.g. `INV-000399`)
- No `reference_number` use observed.

### Customer-visible fields

| Field | Content |
|-------|---------|
| `notes` | Warranty disclaimer text — same on every doc, ~120 chars: "Warranty: RRR Custom RV Services provides a standard 90-day warranty on all parts and labor, except for customer-provide…" |
| `terms` | Quote/invoice terms — "This document serves as a quote and is provided as an estimate only, based on co…" |
| Line item `description` | Per-line context, sometimes customer-facing service notes, sometimes appointment time, sometimes service disclaimer |

Our system must reproduce the warranty + terms text **verbatim** when creating new docs so the customer experience is identical.

### Status flow

`draft` → `sent` → `accepted` → `invoiced` (estimates) and `draft` → `sent` → `paid` / `overdue` (invoices). `Quote converted to Invoice INV-NNNNNN` audit comments mark the conversion point.

### Line item schema

Per line:

| Field | Notes |
|-------|-------|
| `name` | Must match a catalog item name exactly. Zoho doesn't validate this — it'll create a free-form line — but the convention is to map to an existing item. |
| `quantity` | Numeric. Hours for labor, count for parts, linear-ft for parts that bill per-ft, etc. |
| `rate` | Per-unit price. Often matches catalog rate; sometimes overridden (e.g. "Starting at $39" line getting bumped). |
| `description` | Per-line freeform. Carries appointment time, service disclaimers, parts variants ("TPO"), or short service narrative. |

`product_type` is **not populated** on estimate/invoice line items (only on the items themselves), so don't depend on it when reading.

## Comments — the rich data layer

This is the most important and least obvious part of the schema.

### Two comment types matter

Across the 16 sampled docs (8 estimates × 8 invoices) — 94 total comments:
- **78 `system`** — Zoho's audit log: "Quote created for $X.XX", "Quote updated. Amount changed from $A to $B", "Quote converted to Invoice INV-…". Posted by `Zoho Books/system` and the editing user. Read-only narrative; we don't post these.
- **16 `internal`** — actual human notes, never customer-facing. Posted by humans. **This is where the work happens.**

Authors:
- `Jonathan Rannabargar/internal` — creates the structured intake template (see below).
- `Paul Rannabargar/internal` — adds tech notes during/after work.

### The structured intake template (Jonathan's convention)

Every internal comment Jonathan posts on a fresh estimate follows this exact shape. Examples are in `audit/zoho/invoice-comments-{1,4,7}.json` and `estimate-comments-{2,5,6}.json`. Synthesized template:

```
{SERVICE_TYPE} REQUESTED [FOR {DATE} {TIME}]

RV Info: {YEAR} {MAKE} {MODEL}[, {LENGTH} ft]
VIN: {VIN_OR_"unsure"}

Customer Statement: {free-text from customer about what they need}

Service Address: {address}    ← mobile only
Gate Code (Optional): {code}
Parking Instructions (Optional): {notes}

Distance: {miles} m           ← mobile only

Phone: {phone}                ← sometimes
Email: {email}                ← sometimes
```

`SERVICE_TYPE` observed values:
- `ROUTINE MOBILE SERVICE`
- `ON-SITE SERVICE` (shop)
- `EMERGENCY MOBILE SERVICE` (presumed; emergency-flagged intake should produce this)

**Implication:** the intake-form → n8n workflow (Phase 02) must produce exactly this template as an internal comment on the auto-created draft estimate. Same fields, same formatting. Owner gets the same intake artefact they're already used to, just generated automatically.

### Tech notes (Paul's convention)

Free-form internal comments capturing:
- Detailed work narratives ("Perform axle service: includes new oil seals, clean and repack bearings, …")
- Customer dialog summaries ("Customer dropped off unit today and we discussed operation of multiple items …")
- Parts/cost lookups for the quote-builder ("18 tubes of dicor", "aluminum trim is $115 a piece")
- Diagnostic findings ("Compressor temp at upper limit. Heat-limit switch is tripping after …")
- Action items ("Advised customer to contact Forest River warranty administrator …")

These are exactly the kind of message a tech speaks into the PWA voice flow. **The voice flow's natural target is `comment_type=internal`, not estimate line items**, until the tech explicitly says "build me line items from this."

## Implications for our build

### 1. Catalog source-of-truth flips

Planning/05 currently says `packages/service-catalog/src/catalog.ts` is the source of truth and `pnpm seed:catalog` PUSHES to Zoho. **Reverse this.** Zoho holds 364 mature items with real rates. Our local catalog becomes a typed mirror with augmentations Zoho can't store (keywords for AI extraction, normalized unit field, internal taxonomy id).

The 22 placeholder items I scaffolded in Phase 00 are obsolete. Phase 01 replaces them with a Zoho-pulled catalog. The `rateNeedsConfirmation` flag gets removed.

### 2. Intake automation generates the existing template

Phase 02's `02-process-intake-form` workflow must:
1. Create the contact (or look up existing) — populate `notes` with `"{year} {make} {model}, {length}ft"` plus VIN if available.
2. Create a draft estimate.
3. **POST an internal comment** matching Jonathan's template format (with `comment_type=internal`).
4. Pre-populate line items based on AI classification of the customer statement (e.g. "soft floor" → suggest `Labor - Mobile Service (Routine)` + `Labor - Roof Membrane Replacement` candidates for review).
5. SMS the owner, who reviews/sends.

### 3. Mobile pricing model

Voice-flow prompts must teach Claude both pricing modes:
- **Scheduled 1-hour appointment** → bundled item.
- **Variable in-progress work** → itemized labor + flat trip fee + (over-10mi mileage if needed).

Selection rule: if the tech says "appointment for X hours" with a specific date/time, bundled; if the tech says "I worked X hours on Y", itemized.

### 4. Comment-type semantics in tools

The Claude tool layer needs:
- `add_internal_comment(document_id, text)` — for tech notes and the intake template (`comment_type=internal`).
- `add_customer_comment(document_id, text)` — only when the tech wants something customer-facing (rare).
- Reading helpers: filter to `internal` for tech recall ("what did Paul note last visit?"), filter out `system` chatter.

### 5. Customer-visible copy is fixed

The warranty `notes` block and `terms` block are constant across docs. Capture them once into `packages/zoho-tools/src/templates/` and apply on every create. Owner-edited later if needed.

### 6. Custom fields are not an option

Don't design schemas that depend on contact / item / estimate / invoice custom fields — Zoho refuses. Anything beyond the standard schema lives in `notes` or `description` text, or in our local Postgres cache.

### 7. SMS opt-in tracking

`is_sms_enabled` on the contact is the right place to record the intake form's `consent_sms`. Twilio sends should respect it.

### 8. Two real users, prepare for more

Today only `Jonathan Rannabargar` and `Paul Rannabargar` post internal comments. As techs are added, the audit log helps reconstruct who did what. Tool-call logging (`tool_call_log` table in Postgres) should capture the authenticated PWA user so we can trace post-automation.

## Appendix — other discovered facts

- `customer_sub_type=individual` everywhere observed. If a business customer ever shows up, expect company_name populated.
- `payment_terms=0` (Due on Receipt) is universal.
- Customers occasionally have attachments on their contact record (intake screenshots, data tags). Phase 01 doesn't need to read these but the API surface exists.
- `track_inventory=false` on all items observed; RRR doesn't use Zoho inventory. Don't pretend we will.
- All currency conversions are `bcy` (base currency = USD); no multi-currency.
- The org-level `address` field on `/organizations` returned `undefined`; it's apparently set somewhere else in Zoho UI. Need to fetch `/organizations/{id}` for full org details if we need shop address from Zoho rather than env config.

## Refresh

Re-run anytime with `pnpm zoho:audit`. Raw outputs land in `audit/zoho/` (gitignored). When schemas drift in Zoho or new patterns emerge, regenerate this doc.
