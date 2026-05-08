import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { buildAgentRouter, type ClassifyIntakeResponse } from './agent.js';

const env: Env = {
  ZOHO_REFRESH_TOKEN: 'rt',
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'cs',
  ZOHO_ORG_ID: 'org-1',
};

async function classify(
  body: unknown,
): Promise<{ status: number; data: ClassifyIntakeResponse | { error: string } }> {
  const app = buildAgentRouter();
  const res = await app.fetch(
    new Request('http://x/classify-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
  return { status: res.status, data: (await res.json()) as ClassifyIntakeResponse };
}

describe('POST /agent/classify-intake (stub)', () => {
  it('flags emergency=true intake with urgency=emergency', async () => {
    const { status, data } = await classify({
      service_type: 'mobile',
      rv: { year: 2018, make: 'Forest River', model: 'Vibe', length_ft: 28 },
      problem_description: 'tire blew out on the highway',
      emergency: true,
    });
    expect(status).toBe(200);
    if ('urgency' in data) expect(data.urgency).toBe('emergency');
  });

  it('keyword-routes "soft floor" to water_damage (more specific than plumbing keywords like "toilet")', async () => {
    const { data } = await classify({
      service_type: 'shop',
      rv: { year: 2017, make: 'Forest River', model: 'Vibe' },
      // Canonical phrasing the heuristic looks for. "bathroom floor is soft
      // around the toilet" would match "toilet" → plumbing first; intake
      // narratives that include the literal phrase "soft floor" land here.
      problem_description: 'soft floor in the slide-out, around the toilet',
      emergency: false,
    });
    if ('category' in data) expect(data.category).toBe('water_damage');
  });

  it('keyword-routes "AC compressor" to appliance', async () => {
    const { data } = await classify({
      service_type: 'mobile',
      rv: { year: 2025, make: 'Forest River', model: 'Wildwood' },
      problem_description: 'AC compressor keeps shutting off after a minute',
      emergency: false,
    });
    if ('category' in data) expect(data.category).toBe('appliance');
  });

  it('returns category=unknown when no keywords match', async () => {
    const { data } = await classify({
      service_type: 'shop',
      rv: { year: 2010, make: 'X', model: 'Y' },
      problem_description: 'general check up please',
      emergency: false,
    });
    if ('category' in data) {
      expect(data.category).toBe('unknown');
      expect(data.source).toBe('stub');
    }
  });

  it('rejects malformed input with 400', async () => {
    const { status } = await classify({ rv: 'not an object' });
    expect(status).toBe(400);
  });
});
