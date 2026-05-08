import { createZohoClient, type ZohoClient, type ZohoRegion } from '@rrr/zoho-tools';

/**
 * Cloudflare Worker `env` bindings (also drives local-dev via `.env.local`).
 *
 * Spec: planning/13-secrets-manifest.md.
 *
 * Field grouping:
 *   - Zoho — required for any /zoho/* route.
 *   - Internal auth — RRR_INTERNAL_API_KEY gates n8n → Worker calls.
 *   - Anthropic — required for /agent/* once Phase 02 chunk 2 lands real
 *     intake classification.
 *   - Resend / Twilio / DB — surfaced for completeness; not used by chunk 1.
 *   - SHOP_* — destinations for the geocoder; populated from the Zoho org
 *     audit (planning/14).
 */
export interface Env {
  // ── Zoho ────────────────────────────────────────────────────────────────
  ZOHO_REFRESH_TOKEN: string;
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_ORG_ID: string;
  ZOHO_REGION?: ZohoRegion | string;

  // ── Internal trust boundary (n8n ↔ Worker) ──────────────────────────────
  RRR_INTERNAL_API_KEY?: string;

  // ── Anthropic ───────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL_DEFAULT?: string;
  ANTHROPIC_MODEL_FAST?: string;

  // ── Email / SMS / DB ────────────────────────────────────────────────────
  RESEND_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  DATABASE_URL?: string;

  // ── Auth (Phase 04) ─────────────────────────────────────────────────────
  JWT_SECRET?: string;

  // ── App URLs / shop config ──────────────────────────────────────────────
  APP_URL?: string;
  WEB_URL?: string;
  SHOP_ADDRESS?: string;
  SHOP_LATITUDE?: string;
  SHOP_LONGITUDE?: string;
  OWNER_EMAIL?: string;
  AUTHORIZED_TECH_EMAILS?: string;

  // ── Geocoder ────────────────────────────────────────────────────────────
  GEOCODER?: string;
  HERE_API_KEY?: string;
}

/**
 * Builds a ZohoClient lazily from the Worker env. Caches the client per
 * request only — Cloudflare Worker isolates already provide the request-level
 * isolation we need; the underlying access-token cache lives inside the
 * client closure and is recreated each call.
 *
 * Throws if any of the four required Zoho secrets is missing — this is a
 * configuration error, not a recoverable runtime condition.
 */
export function buildZohoClient(env: Env): ZohoClient {
  const required = [
    'ZOHO_REFRESH_TOKEN',
    'ZOHO_CLIENT_ID',
    'ZOHO_CLIENT_SECRET',
    'ZOHO_ORG_ID',
  ] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Worker missing Zoho config: ${missing.join(', ')}`);
  }
  return createZohoClient({
    refreshToken: env.ZOHO_REFRESH_TOKEN,
    clientId: env.ZOHO_CLIENT_ID,
    clientSecret: env.ZOHO_CLIENT_SECRET,
    orgId: env.ZOHO_ORG_ID,
    region: (env.ZOHO_REGION ?? 'com') as ZohoRegion,
  });
}
