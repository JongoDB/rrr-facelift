/**
 * /agent/* — Anthropic-backed endpoints. n8n calls these during the intake
 * workflow to classify the customer's free-text problem description and
 * (later) to compute a mileage fee.
 *
 * **Phase 02 chunk 1 status:** stubbed. The endpoint validates input and
 * returns a deterministic fallback classification (always `service` /
 * `unsure-priority`) so n8n can be wired and tested before the Anthropic
 * SDK is added in chunk 2. The shape of the response is the contract n8n
 * depends on — chunk 2 swaps the implementation, not the contract.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';

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
  /** Suggested service category — maps to ServiceCategory in @rrr/service-catalog. */
  category: z.enum([
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
    'unknown',
  ]),
  /** One-line summary the dispatcher reads. */
  summary: z.string(),
  /** Urgency hint — the structured intake template uses `ROUTINE` vs
   * `EMERGENCY`; this is the AI's best guess for routing. */
  urgency: z.enum(['routine', 'emergency', 'unsure-priority']),
  /** Suggested catalog item ids for line-item pre-population. Empty in the stub. */
  suggested_items: z.array(
    z.object({
      catalog_id: z.string(),
      quantity: z.number(),
      reason: z.string().optional(),
    }),
  ),
  /** Whether the response was AI-generated or a fallback stub. */
  source: z.enum(['anthropic', 'stub']),
});

export type ClassifyIntakeResponse = z.infer<typeof classifyResponseSchema>;

export function buildAgentRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/classify-intake', async (c) => {
    const parsed = classifyIntakeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    // Phase 02 chunk 1: deterministic stub. Chunk 2 replaces this with a
    // Claude Haiku call using the catalog as context.
    const text = parsed.data.problem_description.toLowerCase();
    const heuristicCategory = guessCategoryFromText(text);
    const urgency: ClassifyIntakeResponse['urgency'] = parsed.data.emergency
      ? 'emergency'
      : 'unsure-priority';

    const response: ClassifyIntakeResponse = {
      category: heuristicCategory,
      summary: parsed.data.problem_description.slice(0, 160),
      urgency,
      suggested_items: [],
      source: 'stub',
    };
    return c.json(response);
  });

  return app;
}

/**
 * Lightweight keyword heuristic for the stub. Real classification (chunk 2)
 * uses Haiku with the full catalog as system context, so this is intentionally
 * minimal — just enough that the workflow has a non-`unknown` answer for the
 * obvious cases during local testing.
 */
function guessCategoryFromText(text: string): ClassifyIntakeResponse['category'] {
  const buckets: Array<[ClassifyIntakeResponse['category'], readonly string[]]> = [
    ['roof', ['roof', 'leak', 'membrane', 'reseal', 'dicor', 'vent gasket', 'water damage']],
    ['water_damage', ['soft floor', 'rot', 'delamination']],
    ['electrical', ['electrical', 'wiring', 'fuse', 'breaker', 'battery', 'inverter', 'charger']],
    ['plumbing', ['plumbing', 'water heater', 'faucet', 'toilet', 'tank', 'pump', 'leak from']],
    ['appliance', ['ac ', 'air conditioner', 'furnace', 'refrigerator', 'fridge', 'freezer']],
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
