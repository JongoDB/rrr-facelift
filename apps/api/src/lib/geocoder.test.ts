import { describe, expect, it, vi } from 'vitest';
import { calculateMileageFee, geocodeAddress, haversineMiles } from './geocoder.js';

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('haversineMiles', () => {
  it('returns 0 for identical points', () => {
    expect(
      haversineMiles(
        { latitude: 35.671, longitude: -80.474 },
        { latitude: 35.671, longitude: -80.474 },
      ),
    ).toBe(0);
  });

  it('approximates the Salisbury, NC ↔ Charlotte, NC distance (~40 mi)', () => {
    const salisbury = { latitude: 35.671, longitude: -80.474 };
    const charlotte = { latitude: 35.227, longitude: -80.843 };
    const miles = haversineMiles(salisbury, charlotte);
    expect(miles).toBeGreaterThan(35);
    expect(miles).toBeLessThan(45);
  });
});

describe('geocodeAddress', () => {
  it('forwards the query + countrycodes=us and parses the first result', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = typeof input === 'string' ? new URL(input) : input;
      expect(url.pathname).toContain('/search');
      expect(url.searchParams.get('q')).toBe('255 Rock Hump Rd, Salisbury, NC');
      expect(url.searchParams.get('countrycodes')).toBe('us');
      expect(url.searchParams.get('format')).toBe('jsonv2');
      return jsonRes(200, [
        { display_name: '255 Rock Hump Rd, Salisbury, NC', lat: '35.671', lon: '-80.474' },
      ]);
    }) as unknown as typeof fetch;
    const out = await geocodeAddress('255 Rock Hump Rd, Salisbury, NC', fetchImpl);
    expect(out).toEqual({
      display_name: '255 Rock Hump Rd, Salisbury, NC',
      latitude: 35.671,
      longitude: -80.474,
    });
  });

  it('returns null when Nominatim has no match', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, [])) as unknown as typeof fetch;
    const out = await geocodeAddress('not a real place', fetchImpl);
    expect(out).toBeNull();
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(503, 'busy')) as unknown as typeof fetch;
    await expect(geocodeAddress('x', fetchImpl)).rejects.toThrow(/Nominatim 503/);
  });
});

describe('calculateMileageFee', () => {
  // Pre-resolved origin avoids one geocode call; saves a stub.
  const salisbury = { latitude: 35.671, longitude: -80.474 };

  it('returns $0 fee when destination is within the free radius', async () => {
    // Pick a point ~3 miles east of the shop.
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, [{ display_name: 'Nearby', lat: '35.675', lon: '-80.421' }]),
    ) as unknown as typeof fetch;
    const fee = await calculateMileageFee(
      'Nearby Address',
      { freeRadiusMiles: 10, ratePerMileOver: 2.7, origin: salisbury },
      fetchImpl,
    );
    expect(fee).not.toBeNull();
    expect(fee?.billable_miles).toBe(0);
    expect(fee?.fee_usd).toBe(0);
  });

  it('charges for round-trip miles beyond the free radius', async () => {
    // Charlotte is ~40 mi away → round trip ~80 mi → 70 billable mi (after 10 free) → $189.
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, [{ display_name: 'Charlotte, NC', lat: '35.227', lon: '-80.843' }]),
    ) as unknown as typeof fetch;
    const fee = await calculateMileageFee(
      'Charlotte, NC',
      { freeRadiusMiles: 10, ratePerMileOver: 2.7, origin: salisbury },
      fetchImpl,
    );
    expect(fee).not.toBeNull();
    expect(fee?.billable_miles).toBeGreaterThan(60);
    expect(fee?.billable_miles).toBeLessThan(80);
    expect(fee?.fee_usd).toBeGreaterThan(150);
    expect(fee?.fee_usd).toBeLessThan(220);
  });

  it('returns null when destination geocoding fails', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, [])) as unknown as typeof fetch;
    const fee = await calculateMileageFee(
      'nowhere',
      { freeRadiusMiles: 10, ratePerMileOver: 2.7, origin: salisbury },
      fetchImpl,
    );
    expect(fee).toBeNull();
  });

  it('throws when neither origin nor originAddress is provided', async () => {
    await expect(
      calculateMileageFee('Anywhere', { freeRadiusMiles: 10, ratePerMileOver: 2.7 }),
    ).rejects.toThrow(/origin or rules.originAddress/);
  });
});
