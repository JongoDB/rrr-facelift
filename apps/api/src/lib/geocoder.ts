/**
 * Free Nominatim-backed geocoder for the mileage-fee tool.
 *
 * Nominatim is OpenStreetMap's official geocoding service. Free, no API key,
 * but with strict usage rules: max 1 req/sec, must include a User-Agent
 * identifying the application. We respect both — the Worker is single-threaded
 * per request, and the n8n workflow only geocodes new addresses (not on every
 * call), so we comfortably stay under the rate limit.
 *
 * We deliberately don't add a HERE / Mapbox fallback yet — Nominatim's
 * accuracy for US street addresses is sufficient for "how many miles is this
 * customer from the shop?" The fee rounds to whole miles anyway.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'rrr-facelift/0.1 (https://github.com/JongoDB/rrr-facelift)';

export interface GeocodeResult {
  /** OpenStreetMap-formatted full address. */
  display_name: string;
  latitude: number;
  longitude: number;
}

export interface MileageQuoteRules {
  /** Free radius from shop (miles). Default 10 per RRR's published pricing. */
  freeRadiusMiles: number;
  /** Per-mile rate beyond the free radius. Default 2.70 (catalog item). */
  ratePerMileOver: number;
  /** Origin lat/long if pre-resolved. If absent, the geocoder resolves from `originAddress`. */
  origin?: { latitude: number; longitude: number };
  /** Origin address; used when `origin` is not pre-resolved. */
  originAddress?: string;
}

export interface MileageFee {
  /** Round-trip miles. We bill round-trip, since the tech drives both ways. */
  trip_miles: number;
  /** One-way miles for reference. */
  one_way_miles: number;
  /** Whole miles billed (rounded up over the free radius). */
  billable_miles: number;
  /** Trip-fee dollars (free if within the free radius). */
  fee_usd: number;
  /** Resolved geocodes for both ends. */
  origin: GeocodeResult;
  destination: GeocodeResult;
}

/** Earth radius in miles (mean radius). Good enough for ≤200-mile trips. */
const EARTH_RADIUS_MI = 3958.7613;

/** Haversine distance (miles) between two points specified in degrees. */
export function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return EARTH_RADIUS_MI * c;
}

export async function geocodeAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status} for "${address.slice(0, 80)}"`);
  }
  const arr = (await res.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;
  const first = arr[0];
  if (!first || !first.lat || !first.lon) return null;
  return {
    display_name: first.display_name ?? address,
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  };
}

/**
 * One-shot mileage fee calculation for the intake / voice flows.
 *
 * Billable rule (matches RRR's published pricing + the live Zoho catalog):
 *   - first 10 round-trip miles → covered by the flat $99 service-call fee
 *   - each round-trip mile beyond 10 → $2.70/mi (rounded up)
 */
export async function calculateMileageFee(
  destinationAddress: string,
  rules: MileageQuoteRules,
  fetchImpl: typeof fetch = fetch,
): Promise<MileageFee | null> {
  let origin: GeocodeResult;
  if (rules.origin) {
    origin = {
      display_name: rules.originAddress ?? '(pre-resolved origin)',
      latitude: rules.origin.latitude,
      longitude: rules.origin.longitude,
    };
  } else {
    if (!rules.originAddress) {
      throw new Error('calculateMileageFee: rules.origin or rules.originAddress is required');
    }
    const resolved = await geocodeAddress(rules.originAddress, fetchImpl);
    if (!resolved) return null;
    origin = resolved;
  }
  const destination = await geocodeAddress(destinationAddress, fetchImpl);
  if (!destination) return null;

  const oneWay = haversineMiles(origin, destination);
  const trip = oneWay * 2;
  const billableMiles = Math.max(0, Math.ceil(trip - rules.freeRadiusMiles));
  const feeUsd = Math.round(billableMiles * rules.ratePerMileOver * 100) / 100;
  return {
    trip_miles: Math.round(trip * 10) / 10,
    one_way_miles: Math.round(oneWay * 10) / 10,
    billable_miles: billableMiles,
    fee_usd: feeUsd,
    origin,
    destination,
  };
}
