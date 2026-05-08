-- Initial Postgres schema for the RRR automation platform.
-- Spec: planning/10-infrastructure.md.
--
-- This file runs on first container start (Postgres image's
-- /docker-entrypoint-initdb.d behavior). Drizzle migrations take over from
-- Phase 01 onward; this seed only needs to be valid first-time bootstrap SQL.

-- Cached items mirrored from Zoho (Phase 01)
CREATE TABLE IF NOT EXISTS items (
  catalog_id    text PRIMARY KEY,
  zoho_item_id  text UNIQUE,
  name          text NOT NULL,
  kind          text NOT NULL,
  unit          text NOT NULL,
  rate          numeric(10,2) NOT NULL,
  taxable       boolean DEFAULT false,
  category      text NOT NULL,
  keywords      text[],
  description   text,
  archived      boolean DEFAULT false,
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_keywords_gin ON items USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category) WHERE archived = false;

-- Cached customers for fast autocomplete (Phase 04)
CREATE TABLE IF NOT EXISTS customers (
  zoho_contact_id text PRIMARY KEY,
  display_name    text NOT NULL,
  first_name      text,
  last_name       text,
  phone           text,
  email           text,
  city            text,
  state           text,
  last_synced     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_search
  ON customers
  USING gin(to_tsvector('english', display_name || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')));

-- Geocode cache (Phase 02 — for mileage calc)
CREATE TABLE IF NOT EXISTS geocode_cache (
  address_hash    text PRIMARY KEY,
  address_input   text NOT NULL,
  latitude        double precision,
  longitude       double precision,
  miles_from_shop numeric(8,2),
  cached_at       timestamptz DEFAULT now()
);

-- Intake submissions (Phase 02)
CREATE TABLE IF NOT EXISTS intake_submissions (
  request_id          uuid PRIMARY KEY,
  received_at         timestamptz DEFAULT now(),
  service_type        text NOT NULL,
  customer_payload    jsonb NOT NULL,
  rv_payload          jsonb NOT NULL,
  problem_description text,
  zoho_contact_id     text,
  zoho_estimate_id    text,
  classification      jsonb,
  status              text DEFAULT 'received'
);

-- Audit log of tool calls (Phase 04)
CREATE TABLE IF NOT EXISTS tool_call_log (
  id          bigserial PRIMARY KEY,
  user_email  text,
  tool_name   text NOT NULL,
  input       jsonb,
  output      jsonb,
  duration_ms integer,
  ok          boolean,
  error       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_call_log_created ON tool_call_log(created_at DESC);

-- Magic-link tokens (Phase 04)
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token_hash text PRIMARY KEY,
  email      text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- Workflow tracking tables (Phase 06)
CREATE TABLE IF NOT EXISTS review_requests (
  id              bigserial PRIMARY KEY,
  zoho_invoice_id text NOT NULL UNIQUE,
  customer_phone  text,
  sent_at         timestamptz,
  responded       boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS estimate_followups (
  zoho_estimate_id text PRIMARY KEY,
  followup_count   integer DEFAULT 0,
  last_sent_at     timestamptz
);
