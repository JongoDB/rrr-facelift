/**
 * RRR Worker entry point. Hono app mounting:
 *
 *   GET  /healthz                        — public, sanity check
 *   POST /zoho/upsert-contact            — n8n auth (X-RRR-API-Key)
 *   POST /zoho/create-estimate           — n8n auth
 *   POST /zoho/create-invoice            — n8n auth
 *   POST /zoho/add-comment               — n8n auth
 *   POST /zoho/post-intake-template      — n8n auth
 *   POST /zoho/record-payment            — n8n auth
 *   GET  /zoho/items                     — n8n auth
 *   GET  /zoho/contacts/:id/history      — n8n auth
 *   POST /agent/classify-intake          — n8n auth (Phase 02 chunk 1: stub)
 *
 * The PWA's authenticated endpoints land in Phase 04 with magic-link JWT
 * middleware on a separate router (e.g. /pwa/*).
 */

import { resolveZohoBaseUrl } from '@rrr/zoho-tools';
import { Hono } from 'hono';
import type { Env } from './env.js';
import { requireInternalApiKey } from './middleware/auth.js';
import { buildAgentRouter } from './routes/agent.js';
import { buildZohoRouter } from './routes/zoho.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/healthz', (c) => {
  const region = c.env.ZOHO_REGION ?? 'com';
  return c.json({
    ok: true,
    phase: '02-intake-workflow',
    zoho_base_url: resolveZohoBaseUrl(region as Parameters<typeof resolveZohoBaseUrl>[0]),
  });
});

app.use('/zoho/*', requireInternalApiKey);
app.route('/zoho', buildZohoRouter());

app.use('/agent/*', requireInternalApiKey);
app.route('/agent', buildAgentRouter());

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message ?? 'Internal error' }, 500);
});

export default app;
