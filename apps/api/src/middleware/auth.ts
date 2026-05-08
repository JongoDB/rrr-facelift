import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env.js';

/**
 * Shared-secret middleware on the n8n ↔ Worker boundary.
 *
 * n8n posts to /zoho/* and /agent/* with header `X-RRR-API-Key:
 * <RRR_INTERNAL_API_KEY>`. The PWA (Phase 04) uses a different middleware
 * (magic-link JWT in an httpOnly cookie); this one is server-to-server only.
 *
 * Comparison is constant-time-ish via length check + a single string ===
 * check. Workers' isolate boundary makes timing attacks impractical; the
 * shared secret is also rotated by editing CF secrets, not the codebase.
 */
export const requireInternalApiKey: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const expected = c.env.RRR_INTERNAL_API_KEY;
  if (!expected) {
    return c.json({ error: 'Worker not configured: RRR_INTERNAL_API_KEY is unset' }, 500);
  }
  const got = c.req.header('X-RRR-API-Key');
  if (!got || got.length !== expected.length || got !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
