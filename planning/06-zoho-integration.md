# 06 — Zoho Books Integration

## OAuth Setup (One-Time)

Zoho uses OAuth2 with refresh tokens. The flow:

1. **Create Self Client** in Zoho API Console (`https://api-console.zoho.com`) — type "Self Client" suits this single-tenant case
2. Generate authorization code with scopes:
   - `ZohoBooks.contacts.ALL`
   - `ZohoBooks.estimates.ALL`
   - `ZohoBooks.invoices.ALL`
   - `ZohoBooks.items.ALL`
   - `ZohoBooks.settings.READ`
   - `ZohoBooks.customerpayments.CREATE`
   - `ZohoBooks.salesorders.ALL` (if needed)
3. Exchange code for `refresh_token` (long-lived; this is the credential we store)
4. Use refresh token to mint short-lived `access_token` on every API call (cached for ~50 min)

**Storage:**
- Refresh token: Cloudflare Workers Secret (`ZOHO_REFRESH_TOKEN`) AND n8n credential store (n8n encrypts at rest)
- Client ID / secret: Workers Secrets (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`)
- Org ID: env config (`ZOHO_ORG_ID`) — not secret but environment-specific
- Region: env config (`ZOHO_REGION` = `com` | `eu` | `in` | `com.au` etc.) — Zoho's API hosts differ per region; US is `.com`

**Region-aware base URL:**
```
https://www.zohoapis.{region}/books/v3
```

## Token Refresh Wrapper

`packages/zoho-tools/src/auth.ts`:

```typescript
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const res = await fetch(
    `https://accounts.zoho.${env.ZOHO_REGION}/oauth/v2/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        refresh_token: env.ZOHO_REFRESH_TOKEN,
        client_id: env.ZOHO_CLIENT_ID,
        client_secret: env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    }
  );
  const data = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  };
  return cachedAccessToken.token;
}
```

Token cache lives in Workers' isolate memory; for n8n, use n8n's built-in OAuth2 credential type (handles refresh automatically).

## Rate Limits

Zoho Books: ~100 req/min, ~5000/day on Free plan; higher on paid. Implementation must:
- Retry with exponential backoff on `429`
- Use `If-Modified-Since` headers where supported (items list, contacts list) for cheap polling
- Bulk endpoints when available (e.g., `bulkupdate` for items)

Wrap all fetches in a `zohoFetch()` helper that handles auth + retry + rate limiting transparently.

## Claude Tool Definitions

These are the tools exposed to Claude in the tech-PWA chat loop. Each is implemented in `packages/zoho-tools/src/tools/<tool-name>.ts` with both the JSON schema and the executor function.

### `lookup_customer`

```json
{
  "name": "lookup_customer",
  "description": "Find a customer (Zoho contact) by name, phone, or email. Returns up to 5 matches with their contact ID, name, phone, email, and last job date. Use this whenever the tech mentions a customer name — never invent contact IDs.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search term: partial name, full phone, or email"
      }
    },
    "required": ["query"]
  }
}
```

### `create_customer`

```json
{
  "name": "create_customer",
  "description": "Create a new customer (Zoho contact). Only call this if lookup_customer returns no matches and the tech confirms the customer is new. Always confirm name + phone with the tech before calling.",
  "input_schema": {
    "type": "object",
    "properties": {
      "first_name": { "type": "string" },
      "last_name": { "type": "string" },
      "phone": { "type": "string", "description": "10-digit US phone, any common format" },
      "email": { "type": "string", "format": "email" },
      "billing_address": {
        "type": "object",
        "properties": {
          "street": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string" },
          "zip": { "type": "string" }
        }
      }
    },
    "required": ["first_name", "last_name", "phone"]
  }
}
```

### `search_items`

```json
{
  "name": "search_items",
  "description": "Search the service catalog by keyword to find matching line items (services, parts, fees, labor). Use this to map natural-language descriptions to specific catalog item IDs before adding them to estimates or invoices. Returns id, name, unit, default rate, and category.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Keyword(s) — e.g., 'roof reseal', 'dicor', 'labor', 'trip fee'" },
      "category": {
        "type": "string",
        "enum": ["labor", "roof", "electrical", "plumbing", "mechanical", "appliance", "towing", "inspection", "remodel", "winterization", "water_damage", "parts", "fee", "discount"],
        "description": "Optional filter"
      }
    },
    "required": ["query"]
  }
}
```

### `create_estimate`

```json
{
  "name": "create_estimate",
  "description": "Create a draft estimate in Zoho Books. Always confirm line items and total with the tech before calling. Mileage is auto-calculated server-side if mobile=true and customer has a billing address — do NOT include mileage line items manually.",
  "input_schema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" },
      "mobile": { "type": "boolean", "description": "True if mobile service call (auto-adds trip fee + mileage)" },
      "line_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "catalog_item_id": { "type": "string", "description": "ID from search_items" },
            "quantity": { "type": "number", "minimum": 0.25 },
            "rate_override": { "type": "number", "description": "Optional override of catalog rate" },
            "description_suffix": { "type": "string", "description": "Optional addendum to default description" }
          },
          "required": ["catalog_item_id", "quantity"]
        }
      },
      "internal_notes": { "type": "string", "description": "Tech-only notes; not visible to customer" },
      "customer_notes": { "type": "string", "description": "Visible on the estimate PDF" },
      "send": { "type": "boolean", "default": false, "description": "If true, email to customer immediately. Default false (draft)." }
    },
    "required": ["customer_id", "line_items"]
  }
}
```

### `create_invoice`

Same shape as `create_estimate` but creates an invoice. Add `payment_terms` (default `Due on Receipt`) and `due_date` (default today + 0).

### `add_lines_to_estimate` / `add_lines_to_invoice`

For when tech wants to amend an existing draft:

```json
{
  "name": "add_lines_to_estimate",
  "description": "Append line items to an existing draft estimate. Errors if estimate is already sent or accepted.",
  "input_schema": {
    "type": "object",
    "properties": {
      "estimate_id": { "type": "string" },
      "line_items": { "$ref": "#/definitions/lineItemArray" }
    },
    "required": ["estimate_id", "line_items"]
  }
}
```

### `convert_estimate_to_invoice`

```json
{
  "name": "convert_estimate_to_invoice",
  "description": "Convert an accepted estimate into an invoice. Use after work is complete and the estimate matches what was actually done.",
  "input_schema": {
    "type": "object",
    "properties": {
      "estimate_id": { "type": "string" },
      "send": { "type": "boolean", "default": false }
    },
    "required": ["estimate_id"]
  }
}
```

### `record_payment`

```json
{
  "name": "record_payment",
  "description": "Record a customer payment against one or more invoices. Use when tech reports payment received in the field (cash, check, card via Square, etc.).",
  "input_schema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" },
      "amount": { "type": "number", "minimum": 0.01 },
      "payment_method": { "type": "string", "enum": ["cash", "check", "card", "ach", "other"] },
      "reference": { "type": "string", "description": "Check #, last-4 of card, etc." },
      "invoice_ids": { "type": "array", "items": { "type": "string" } },
      "date": { "type": "string", "format": "date", "description": "Default today" }
    },
    "required": ["customer_id", "amount", "payment_method", "invoice_ids"]
  }
}
```

### `get_customer_history`

```json
{
  "name": "get_customer_history",
  "description": "Return the last N estimates and invoices for a customer, with status, totals, and dates. Use when tech asks 'what did we last do for this customer?' or to avoid duplicate work.",
  "input_schema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" },
      "limit": { "type": "integer", "default": 10, "minimum": 1, "maximum": 50 }
    },
    "required": ["customer_id"]
  }
}
```

### `calculate_mileage_fee`

```json
{
  "name": "calculate_mileage_fee",
  "description": "Calculate the mileage fee from the shop to a given address. Returns the one-way miles, total trip miles, and the fee amount applying the free-radius and per-mile rules. Use during quote planning.",
  "input_schema": {
    "type": "object",
    "properties": {
      "destination_address": { "type": "string", "description": "Full address or 'street, city, state zip' format" }
    },
    "required": ["destination_address"]
  }
}
```

(Implementation uses a free geocoder — Nominatim/OpenStreetMap or HERE free tier — with results cached in Postgres to avoid repeat lookups.)

### `send_document`

```json
{
  "name": "send_document",
  "description": "Email an estimate or invoice to the customer with a friendly message. Document must be in 'draft' or 'pending' status.",
  "input_schema": {
    "type": "object",
    "properties": {
      "document_type": { "type": "string", "enum": ["estimate", "invoice"] },
      "document_id": { "type": "string" },
      "message": { "type": "string", "description": "Personal note included in email body" }
    },
    "required": ["document_type", "document_id"]
  }
}
```

## System Prompt Skeleton

In the tech PWA chat loop, the system prompt looks like:

```
You are an assistant for technicians at RRR Custom RV Services in Salisbury, NC.

Your job is to help the tech do paperwork — looking up customers, creating estimates, creating invoices, recording payments — in their existing Zoho Books account.

Hard rules:
1. Never invent IDs. Always look up customers and items first.
2. Confirm before creating any billable document. Show the tech the line items and totals.
3. Mileage and trip fees are auto-calculated when mobile=true. Don't add them manually.
4. Labor minimum is 1 hour per visit — enforce this.
5. Use the search_items tool to find catalog matches. If nothing matches well, ask the tech rather than guess.
6. The tech is in the field, often outside, on a phone. Be brief. Bullet points over prose.

Today's date: {DATE}
Tech: {TECH_NAME}
Shop address: {SHOP_ADDRESS}
```

When voice transcripts are involved (Phase 05), append:

```
The user message below is a transcript of the tech speaking. They are describing work performed (for an invoice) or work to be performed (for an estimate). Extract line items mapping to the catalog. Be liberal with calling search_items — try multiple keyword variations if needed. Confirm ambiguous items.
```

## Webhooks (Inbound from Zoho)

Zoho Books can fire webhooks on events. Configure these to hit `flows.triple-r-rv.com/webhook/zoho/<event>`:

| Event | Endpoint | Triggers |
|-------|----------|----------|
| `invoice.paid` | `/webhook/zoho/invoice-paid` | Schedule review-request SMS in 24h |
| `estimate.accepted` | `/webhook/zoho/estimate-accepted` | Notify tech, schedule job |
| `estimate.declined` | `/webhook/zoho/estimate-declined` | Notify tech, log |

Verify Zoho's `X-Zoho-Webhook-Signature` (HMAC-SHA256 with shared secret) on every inbound request before processing.

## Testing Strategy

- **Unit tests:** Mock `fetch`, verify each tool function constructs the right URL/body and parses responses correctly.
- **Integration tests:** Live calls against owner's Zoho org, but only against records tagged `[TEST]` in customer name. Cleanup script deletes `[TEST]` records after suite.
- **Contract tests:** Run weekly to catch Zoho API changes — pull schema-relevant endpoints, snapshot response shapes, fail if drifted.
