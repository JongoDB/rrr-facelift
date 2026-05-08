/**
 * zohoFetch — wraps `fetch` for Zoho Books with token injection, automatic
 * retry on 429 / 5xx with exponential backoff + jitter, and structured errors.
 *
 * Designed to be portable across Node 22 (scripts), Workers (apps/api), and
 * test environments — pass a custom `fetchImpl` when stubbing.
 */

import { resolveZohoBaseUrl, type ZohoConfig } from './config.js';

export interface ZohoErrorBody {
  code?: number;
  message?: string;
  [key: string]: unknown;
}

export class ZohoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: ZohoErrorBody | string,
    public readonly attempts: number,
  ) {
    super(
      `Zoho ${status} ${path} (after ${attempts} attempt${attempts === 1 ? '' : 's'}): ${
        typeof body === 'string'
          ? body.slice(0, 200)
          : (body.message ?? JSON.stringify(body).slice(0, 200))
      }`,
    );
    this.name = 'ZohoApiError';
  }
}

export interface ZohoFetchOptions extends RequestInit {
  /** Query params merged with the URL. `organization_id` is added automatically. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Override default 4 attempts (initial + 3 retries). */
  maxAttempts?: number;
  /** Override default base sleep (250ms) for retries. */
  baseSleepMs?: number;
}

export interface ZohoFetchContext {
  config: ZohoConfig;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

const RETRYABLE_5XX = new Set([500, 502, 503, 504]);
const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_SLEEP_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Decides whether a failed response should be retried.
 *
 * - 429 (rate limit) is always retried; Zoho explicitly tells you to.
 * - 5xx is retried for idempotent methods (GET, HEAD, PUT, DELETE) only.
 *   POST and PATCH might have already succeeded server-side when the response
 *   was lost on the wire — retrying could create duplicate estimates,
 *   invoices, payments, contacts, comments. The audit-log noise alone would
 *   be bad; the financial impact of duplicate invoices is worse.
 */
function isRetryableStatus(status: number, method: string | undefined): boolean {
  if (status === 429) return true;
  if (!RETRYABLE_5XX.has(status)) return false;
  return !NON_IDEMPOTENT_METHODS.has((method ?? 'GET').toUpperCase());
}

export async function zohoFetch<T = unknown>(
  ctx: ZohoFetchContext,
  path: string,
  options: ZohoFetchOptions = {},
): Promise<T> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const url = new URL(resolveZohoBaseUrl(ctx.config.region) + path);
  url.searchParams.set('organization_id', ctx.config.orgId);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseSleepMs = options.baseSleepMs ?? DEFAULT_BASE_SLEEP_MS;

  let lastError!: ZohoApiError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = await ctx.getAccessToken();
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Zoho-oauthtoken ${token}`);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetchImpl(url, { ...options, headers });
    const text = await res.text();
    let body: ZohoErrorBody | string;
    try {
      body = text ? (JSON.parse(text) as ZohoErrorBody) : '';
    } catch {
      body = text;
    }
    if (res.ok) {
      return body as T;
    }
    const err = new ZohoApiError(res.status, path, body, attempt);
    if (!isRetryableStatus(res.status, options.method) || attempt === maxAttempts) {
      throw err;
    }
    lastError = err;
    const backoff = baseSleepMs * 2 ** (attempt - 1);
    const jitter = Math.random() * baseSleepMs;
    await sleep(backoff + jitter);
  }
  throw lastError;
}
