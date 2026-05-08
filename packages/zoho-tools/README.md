# @rrr/zoho-tools

OAuth flow helpers, refresh-token caching, and the Claude **tool definitions + executors** that drive every Zoho Books operation.

This package is shared by `apps/api` (Cloudflare Worker, runs the Claude tool-use loop) and `infra/n8n/` workflows (which call the same operations via API Worker endpoints).

## Tool inventory

Spec: planning/06-zoho-integration.md. Each tool is implemented in `src/tools/<name>.ts` with three exports: the JSON schema, a zod input validator, and the executor function.

- `lookup_customer`
- `create_customer`
- `search_items`
- `create_estimate`
- `create_invoice`
- `add_lines_to_estimate` / `add_lines_to_invoice`
- `convert_estimate_to_invoice`
- `record_payment`
- `get_customer_history`
- `calculate_mileage_fee`
- `send_document`

## Phase 00 status

Stub only — type contract for `ZohoConfig` and a `phase00Scaffold` placeholder so the workspace builds and tests run. Full OAuth flow + each tool implementation lands in **Phase 01**.

## Configuration

See `.env.example`. Required at runtime:

- `ZOHO_REFRESH_TOKEN`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_ORG_ID`
- `ZOHO_REGION` (default `com`)
