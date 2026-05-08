/**
 * Phase 00 stub. The real Hono app — magic-link auth, Zoho tool dispatcher,
 * Anthropic streaming proxy — is layered in across Phases 02–05.
 */

import { resolveZohoBaseUrl } from '@rrr/zoho-tools';

export interface Env {
  ZOHO_REGION?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return Response.json({
        ok: true,
        phase: '00-foundation',
        zoho_base_url: resolveZohoBaseUrl(
          (env.ZOHO_REGION ?? 'com') as Parameters<typeof resolveZohoBaseUrl>[0],
        ),
      });
    }
    return new Response('rrr-api: phase 00 stub', { status: 200 });
  },
};
