import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { buildAgentRouter, type ClassifyIntakeResponse } from './agent.js';

const env: Env = {
  ZOHO_REFRESH_TOKEN: 'rt',
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'cs',
  ZOHO_ORG_ID: 'org-1',
};

async function classify(body: unknown, overrideEnv: Env = env) {
  const app = buildAgentRouter();
  const res = await app.fetch(
    new Request('http://x/classify-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    overrideEnv,
  );
  return { status: res.status, data: (await res.json()) as ClassifyIntakeResponse };
}

describe('POST /agent/classify-intake — stub fallback', () => {
  it('flags emergency=true with urgency=emergency', async () => {
    const { status, data } = await classify({
      service_type: 'mobile',
      rv: { year: 2018, make: 'Forest River', model: 'Vibe', length_ft: 28 },
      problem_description: 'tire blew out on the highway',
      emergency: true,
    });
    expect(status).toBe(200);
    expect(data.urgency).toBe('emergency');
    expect(data.source).toBe('stub');
  });

  it('keyword-routes "soft floor" to water_damage', async () => {
    const { data } = await classify({
      service_type: 'shop',
      rv: { year: 2017, make: 'Forest River', model: 'Vibe' },
      problem_description: 'soft floor in the slide-out, around the toilet',
      emergency: false,
    });
    expect(data.category).toBe('water_damage');
  });

  it('keyword-routes "AC compressor" to appliance', async () => {
    const { data } = await classify({
      service_type: 'mobile',
      rv: { year: 2025, make: 'Forest River', model: 'Wildwood' },
      problem_description: 'AC compressor keeps shutting off after a minute',
      emergency: false,
    });
    expect(data.category).toBe('appliance');
  });

  it('returns category=unknown when no keywords match', async () => {
    const { data } = await classify({
      service_type: 'shop',
      rv: { year: 2010, make: 'X', model: 'Y' },
      problem_description: 'general check up please',
      emergency: false,
    });
    expect(data.category).toBe('unknown');
    expect(data.source).toBe('stub');
  });

  it('rejects malformed input with 400', async () => {
    const { status } = await classify({ rv: 'not an object' });
    expect(status).toBe(400);
  });
});

describe('POST /agent/classify-intake — Anthropic path', () => {
  it('uses the injected classifier when ANTHROPIC_API_KEY is set', async () => {
    const stub = vi.fn(async () => ({
      category: 'roof' as const,
      summary: 'roof leak',
      urgency: 'routine' as const,
      suggested_items: [],
      source: 'anthropic' as const,
    }));
    const app = buildAgentRouter({ classifyIntake: stub });
    const res = await app.fetch(
      new Request('http://x/classify-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: 'mobile',
          rv: { year: 2018, make: 'X', model: 'Y' },
          problem_description: 'roof seam leak',
          emergency: false,
        }),
      }),
      { ...env, ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_MODEL_FAST: 'claude-haiku-4-5' },
    );
    expect(res.status).toBe(200);
    expect(stub).toHaveBeenCalledTimes(1);
    const data = (await res.json()) as ClassifyIntakeResponse;
    expect(data.source).toBe('anthropic');
  });

  it('falls back to stub when the injected classifier throws', async () => {
    const stub = vi.fn(async () => {
      throw new Error('Anthropic 503');
    });
    const app = buildAgentRouter({ classifyIntake: stub });
    const res = await app.fetch(
      new Request('http://x/classify-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: 'mobile',
          rv: { year: 2018, make: 'X', model: 'Y' },
          problem_description: 'roof seam leak',
          emergency: false,
        }),
      }),
      { ...env, ANTHROPIC_API_KEY: 'sk-ant-test' },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as ClassifyIntakeResponse;
    expect(data.source).toBe('stub');
    expect(data.category).toBe('roof');
  });
});

describe('POST /agent/calculate-mileage', () => {
  it('returns 500 when no shop config is present', async () => {
    const app = buildAgentRouter({
      calculateMileageFee: vi.fn(async () => null),
    });
    const res = await app.fetch(
      new Request('http://x/calculate-mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_address: '1 Oak St, Salisbury, NC' }),
      }),
      { ...env, SHOP_ADDRESS: undefined },
    );
    expect(res.status).toBe(500);
  });

  it('uses pre-resolved SHOP_LATITUDE/LONGITUDE when set', async () => {
    const stub = vi.fn(async () => ({
      trip_miles: 6,
      one_way_miles: 3,
      billable_miles: 0,
      fee_usd: 0,
      origin: { display_name: 'shop', latitude: 35.671, longitude: -80.474 },
      destination: { display_name: 'dest', latitude: 35.675, longitude: -80.421 },
    }));
    const app = buildAgentRouter({ calculateMileageFee: stub });
    const res = await app.fetch(
      new Request('http://x/calculate-mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_address: '1 Oak St' }),
      }),
      { ...env, SHOP_LATITUDE: '35.671', SHOP_LONGITUDE: '-80.474' },
    );
    expect(res.status).toBe(200);
    expect(stub).toHaveBeenCalledTimes(1);
    const callArgs = stub.mock.calls[0] as unknown as
      | [string, { origin?: { latitude: number; longitude: number } }]
      | undefined;
    expect(callArgs?.[1].origin).toEqual({ latitude: 35.671, longitude: -80.474 });
  });

  it('returns 422 when geocoding the destination fails', async () => {
    const stub = vi.fn(async () => null);
    const app = buildAgentRouter({ calculateMileageFee: stub });
    const res = await app.fetch(
      new Request('http://x/calculate-mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_address: 'nowhere' }),
      }),
      { ...env, SHOP_ADDRESS: '255 Rock Hump Rd, Salisbury, NC' },
    );
    expect(res.status).toBe(422);
  });
});
