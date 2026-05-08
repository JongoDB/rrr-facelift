/**
 * Intake classifier — calls Claude Haiku with a system prompt that includes
 * a slimmed-down view of the canonical service catalog, then asks for a
 * structured classification of the customer's free-text problem description.
 *
 * Used by apps/api's POST /agent/classify-intake. The Worker falls back to
 * a deterministic keyword heuristic when no `ANTHROPIC_API_KEY` is configured
 * (covers local dev + tests). The shape returned here is the contract n8n
 * depends on; switching providers later doesn't change the route's response.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CATALOG, type ServiceCategory } from '@rrr/service-catalog';

export interface ClassifyIntakeRequest {
  service_type: 'mobile' | 'shop';
  rv: { year: number; make: string; model: string; length_ft?: number };
  problem_description: string;
  emergency: boolean;
}

export interface ClassifyIntakeResult {
  category: ServiceCategory | 'unknown';
  summary: string;
  urgency: 'routine' | 'emergency' | 'unsure-priority';
  suggested_items: Array<{
    /** Internal catalog id (preferred) or Zoho item_id when no internal id maps. */
    catalog_id: string;
    quantity: number;
    /** Why the model picked this item — for tech review. */
    reason?: string;
  }>;
  source: 'anthropic' | 'stub';
}

export interface ClassifyIntakeOptions {
  apiKey: string;
  /** Defaults to claude-haiku-4-5 (per planning/03 — high-volume cheap classifier). */
  model?: string;
  /** Override base URL for tests / proxies. */
  baseURL?: string;
  /** Hard timeout for the API call. */
  timeoutMs?: number;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_TIMEOUT_MS = 12_000;

/** Prepares a small, model-friendly summary of the catalog for the system prompt. */
function buildCatalogContext(): string {
  // Narrow to active service / labor / fee items + a curated parts sample.
  // The full 364-item catalog is too long for an intake classifier; a few
  // dozen exemplars drive the right `suggested_items` mapping without
  // bloating the prompt.
  const exemplars = CATALOG.filter(
    (i) => !i.archived && (i.kind === 'labor' || i.kind === 'service' || i.kind === 'fee'),
  ).slice(0, 60);
  return exemplars
    .map((i) => `- ${i.id} :: "${i.name}" :: $${i.rate}/${i.unit} :: ${i.category}`)
    .join('\n');
}

const SYSTEM_PROMPT = `You are an intake classifier for RRR Custom RV Services in Salisbury, NC.

You receive a customer's intake-form submission with their RV details and a free-text problem description. Return a structured classification that the dispatcher uses to pre-populate a Zoho Books estimate before a tech reviews it.

Hard rules:
1. NEVER invent catalog ids. Only suggest items that appear in the catalog list below.
2. category MUST be one of: roof, electrical, plumbing, mechanical, appliance, towing, inspection, remodel, winterization, water_damage, unknown.
3. urgency: pick "emergency" only when the customer's wording suggests immediate safety/usability impact (no working AC in summer, broken roof in storm, gear failure on the road). Otherwise "routine". If ambiguous: "unsure-priority".
4. summary: ONE sentence. Plain English. What did the customer say they need?
5. suggested_items: only when you have ≥80% confidence. Include 1-4 items max with quantities the tech is likely to confirm. Include a one-phrase reason per item.

Return ONLY valid JSON in this exact shape — no prose, no code fence:
{
  "category": "<one of the categories>",
  "summary": "<one sentence>",
  "urgency": "routine" | "emergency" | "unsure-priority",
  "suggested_items": [{ "catalog_id": "<id from catalog>", "quantity": <number>, "reason": "<short>" }]
}

CATALOG (id :: customer-visible name :: rate/unit :: category):
{CATALOG}`;

function userPromptFor(req: ClassifyIntakeRequest): string {
  const lengthSuffix = req.rv.length_ft !== undefined ? `, ${req.rv.length_ft} ft` : '';
  return [
    `Service type: ${req.service_type}`,
    `RV: ${req.rv.year} ${req.rv.make} ${req.rv.model}${lengthSuffix}`,
    `Customer flagged emergency: ${req.emergency}`,
    '',
    'Customer statement:',
    req.problem_description,
  ].join('\n');
}

/**
 * Strict-shape parser for Haiku's response. We don't trust the model to
 * return our exact union — validate categorical values and clamp anything
 * unexpected to "unknown" / "unsure-priority". Suggested items get filtered
 * to those whose catalog_id we can locate locally.
 */
function parseHaikuResponse(text: string): Omit<ClassifyIntakeResult, 'source'> | null {
  const trimmed = text.trim();
  // Strip optional code fences if the model added them despite instructions.
  const stripped = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const allowedCategories = new Set<ServiceCategory | 'unknown'>([
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
  ]);
  const allowedUrgency = new Set<'routine' | 'emergency' | 'unsure-priority'>([
    'routine',
    'emergency',
    'unsure-priority',
  ]);
  const category = allowedCategories.has(r.category as ServiceCategory | 'unknown')
    ? (r.category as ServiceCategory | 'unknown')
    : 'unknown';
  const urgency = allowedUrgency.has(r.urgency as 'routine' | 'emergency' | 'unsure-priority')
    ? (r.urgency as 'routine' | 'emergency' | 'unsure-priority')
    : 'unsure-priority';
  const summary = typeof r.summary === 'string' ? r.summary.slice(0, 320) : '';

  const knownIds = new Set(CATALOG.map((i) => i.id));
  const rawItems = Array.isArray(r.suggested_items) ? r.suggested_items : [];
  const suggested_items = rawItems.flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    const obj = it as Record<string, unknown>;
    const id = typeof obj.catalog_id === 'string' ? obj.catalog_id : null;
    const qty = Number(obj.quantity);
    if (!id || !Number.isFinite(qty) || qty <= 0) return [];
    if (!knownIds.has(id)) return [];
    const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : undefined;
    return [reason ? { catalog_id: id, quantity: qty, reason } : { catalog_id: id, quantity: qty }];
  });

  return { category, summary, urgency, suggested_items };
}

export async function classifyIntake(
  request: ClassifyIntakeRequest,
  options: ClassifyIntakeOptions,
): Promise<ClassifyIntakeResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const system = SYSTEM_PROMPT.replace('{CATALOG}', buildCatalogContext());
  const message = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: userPromptFor(request) }],
  });
  const firstBlock = message.content[0];
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
  const parsed = parseHaikuResponse(text);
  if (!parsed) {
    return {
      category: 'unknown',
      summary: request.problem_description.slice(0, 160),
      urgency: request.emergency ? 'emergency' : 'unsure-priority',
      suggested_items: [],
      source: 'anthropic',
    };
  }
  return { ...parsed, source: 'anthropic' };
}
