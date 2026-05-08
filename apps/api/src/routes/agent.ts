/**
 * /agent/* — Anthropic-backed endpoints. n8n calls these during the intake
 * workflow to classify the customer's free-text problem description and to
 * compute the mileage fee for mobile service.
 *
 * `classify-intake` calls Claude Haiku via @rrr/agent when ANTHROPIC_API_KEY
 * is set; falls back to a deterministic keyword heuristic when not (covers
 * local dev + tests). `calculate-mileage` uses Nominatim (free, no key) —
 * see lib/geocoder.ts.
 */

import { classifyIntake } from '@rrr/agent';
import { MILEAGE_FREE_RADIUS_MILES, MILEAGE_RATE_PER_MILE_OVER } from '@rrr/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import { calculateMileageFee, type MileageFee } from '../lib/geocoder.js';

const classifyIntakeSchema = z
  .object({
    service_type: z.enum(['mobile', 'shop']),
    rv: z.object({
      year: z.number().int(),
      make: z.string(),
      model: z.string(),
      length_ft: z.number().optional(),
    }),
    problem_description: z.string().min(1).max(8000),
    emergency: z.boolean(),
  })
  .strict();

const classifyResponseSchema = z.object({
  category: z.enum([
    'labor',
    'roof',
    'electrical',
    'plumbing',
    'mechanical',
    'appliance',
    'towing',
    'inspection',
    'remodel',
    'winterization',
    'water_damage',
    'parts',
    'fee',
    'discount',
    'unknown',
  ]),
  summary: z.string(),
  urgency: z.enum(['routine', 'emergency', 'unsure-priority']),
  suggested_items: z.array(
    z.object({
      catalog_id: z.string(),
      quantity: z.number(),
      reason: z.string().optional(),
    }),
  ),
  source: z.enum(['anthropic', 'stub']),
});

export type ClassifyIntakeResponse = z.infer<typeof classifyResponseSchema>;

const calculateMileageSchema = z
  .object({
    destination_address: z.string().min(5).max(400),
  })
  .strict();

/**
 * Allow tests to inject stub implementations of the upstream callers. In
 * production we always pass the real ones from @rrr/agent and ./lib/geocoder.
 */
export interface AgentRouterDeps {
  classifyIntake?: typeof classifyIntake;
  calculateMileageFee?: typeof calculateMileageFee;
}

export function buildAgentRouter(deps: AgentRouterDeps = {}) {
  const app = new Hono<{ Bindings: Env }>();
  const classifyImpl = deps.classifyIntake ?? classifyIntake;
  const mileageImpl = deps.calculateMileageFee ?? calculateMileageFee;

  app.post('/classify-intake', async (c) => {
    const parsed = classifyIntakeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    if (c.env.ANTHROPIC_API_KEY) {
      try {
        const result = await classifyImpl(parsed.data, {
          apiKey: c.env.ANTHROPIC_API_KEY,
          ...(c.env.ANTHROPIC_MODEL_FAST ? { model: c.env.ANTHROPIC_MODEL_FAST } : {}),
        });
        return c.json(result satisfies ClassifyIntakeResponse);
      } catch (err) {
        console.warn('Anthropic classify-intake failed; falling back to stub:', err);
        // fall through to the deterministic stub so the workflow still runs
      }
    }
    return c.json(stubClassify(parsed.data));
  });

  /**
   * POST /agent/calculate-mileage
   * Geocodes the customer's address (Nominatim) and the shop address, applies
   * the published RRR mileage rule (10-mi free radius + $2.70/mi over). Origin
   * is taken from `SHOP_LATITUDE`/`SHOP_LONGITUDE` if pre-resolved; otherwise
   * geocoded from `SHOP_ADDRESS`.
   */
  app.post('/calculate-mileage', async (c) => {
    const parsed = calculateMileageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const lat = c.env.SHOP_LATITUDE ? Number(c.env.SHOP_LATITUDE) : Number.NaN;
    const lng = c.env.SHOP_LONGITUDE ? Number(c.env.SHOP_LONGITUDE) : Number.NaN;
    const origin =
      Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : undefined;
    if (!origin && !c.env.SHOP_ADDRESS) {
      return c.json({ error: 'Worker missing SHOP_ADDRESS / SHOP_LATITUDE / SHOP_LONGITUDE' }, 500);
    }
    const fee: MileageFee | null = await mileageImpl(parsed.data.destination_address, {
      freeRadiusMiles: MILEAGE_FREE_RADIUS_MILES,
      ratePerMileOver: MILEAGE_RATE_PER_MILE_OVER,
      ...(origin ? { origin } : {}),
      ...(c.env.SHOP_ADDRESS ? { originAddress: c.env.SHOP_ADDRESS } : {}),
    });
    if (!fee) {
      return c.json(
        {
          error: 'Could not geocode destination address',
          destination_address: parsed.data.destination_address,
        },
        422,
      );
    }
    return c.json(fee);
  });

  return app;
}

function stubClassify(input: z.infer<typeof classifyIntakeSchema>): ClassifyIntakeResponse {
  const text = input.problem_description.toLowerCase();
  return {
    category: guessCategoryFromText(text),
    summary: input.problem_description.slice(0, 160),
    urgency: input.emergency ? 'emergency' : 'unsure-priority',
    suggested_items: [],
    source: 'stub',
  };
}

/**
 * Deterministic keyword heuristic used when ANTHROPIC_API_KEY isn't set.
 * Order is significant — first match wins. Put more-specific buckets before
 * more-generic ones (e.g. water_damage before plumbing, since "soft floor
 * around the toilet" should classify as water damage, not plumbing, even
 * though "toilet" is a plumbing keyword).
 */
function guessCategoryFromText(text: string): ClassifyIntakeResponse['category'] {
  const buckets: Array<[ClassifyIntakeResponse['category'], readonly string[]]> = [
    ['water_damage', ['soft floor', 'rot ', 'delamination', 'water damage']],
    ['roof', ['roof', 'leak', 'membrane', 'reseal', 'dicor', 'vent gasket']],
    ['appliance', ['ac ', 'air conditioner', 'furnace', 'refrigerator', 'fridge', 'freezer']],
    ['electrical', ['electrical', 'wiring', 'fuse', 'breaker', 'battery', 'inverter', 'charger']],
    ['plumbing', ['plumbing', 'water heater', 'faucet', 'toilet', 'tank', 'pump', 'leak from']],
    ['mechanical', ['axle', 'brake', 'tire', 'wheel', 'engine', 'transmission', 'generator']],
    ['towing', ['baseplate', 'base plate', 'tow', 'hitch', 'light kit']],
    ['winterization', ['winterize', 'antifreeze', 'dewinterize', 'de-winterize']],
    ['inspection', ['inspect', 'inspection', 'pre-purchase']],
  ];
  for (const [cat, kws] of buckets) {
    if (kws.some((kw) => text.includes(kw))) return cat;
  }
  return 'unknown';
}
