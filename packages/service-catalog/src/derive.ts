/**
 * Pure transforms from a raw Zoho item to a typed CatalogItem.
 *
 * Zoho only stores `name`, `rate`, `description`, `is_taxable`, `product_type`,
 * `status`. Everything else our system needs (kind, category, unit, keywords,
 * dotted internal id) is derived by parsing the item NAME — RRR's Zoho org
 * uses naming conventions instead of tags / SKUs / categories.
 *
 * Conventions documented in planning/14-zoho-org-schema.md.
 */

import type { CatalogItem, ItemKind, ItemUnit, ServiceCategory } from './types.js';

export interface RawZohoItem {
  item_id: string;
  name: string;
  rate: number;
  description?: string;
  is_taxable?: boolean;
  product_type?: string;
  status?: string;
  unit?: string;
}

const KIND_PREFIX_TO_KIND: Record<string, ItemKind> = {
  labor: 'labor',
  parts: 'part',
  sub: 'service',
  discount: 'discount',
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'to',
  'from',
  'by',
  'per',
  'as',
  'is',
]);

/**
 * Order matters: more specific category-defining keywords first.
 * `labor` and `parts` are deliberately last as fallbacks for items prefixed
 * `Labor - …` / `Parts - …` that didn't match anything more specific.
 */
const CATEGORY_RULES: Array<{ category: ServiceCategory; patterns: RegExp[] }> = [
  {
    category: 'roof',
    patterns: [
      /\broof\b/,
      /\bmembrane\b/,
      /\bdicor\b/,
      /\beternabond\b/,
      /\blap[\s-]?seal/,
      /\bpeel[\s-]?seal/,
    ],
  },
  {
    category: 'water_damage',
    patterns: [/water\s+damage/, /soft\s+floor/, /\bdelamination\b/, /\brot\b/, /\bsubfloor\b/],
  },
  {
    category: 'plumbing',
    patterns: [
      /\bplumb/,
      /\bfaucet\b/,
      /\btoilet\b/,
      /\bpex\b/,
      /\bvalve\b/,
      /\bdrain\b/,
      /\bwater\s+line/,
      /\bwater\s+heater\b/,
    ],
  },
  {
    category: 'appliance',
    patterns: [
      /\ba\/c\b/,
      /\bac\s+(?:repair|unit|gasket|service)/,
      /\bair\s+conditioner/,
      /\bfurnace\b/,
      /\brefrigerator\b/,
      /\bfridge\b/,
      /\bfreezer\b/,
      /\bmicrowave\b/,
      /\bstove\b/,
      /\bgenerator\b/,
    ],
  },
  {
    category: 'electrical',
    patterns: [
      /\belectrical\b/,
      /\bwiring?\b/,
      /\bfuse\b/,
      /\bbreaker\b/,
      /\bswitch\b/,
      /\binverter\b/,
      /\bconverter\b/,
      /\bbattery\b/,
      /\bshore\s+power/,
      /\b12v\b/,
      /\b120v\b/,
      /\bsolar\b/,
    ],
  },
  {
    category: 'towing',
    patterns: [
      /\btow\b/,
      /\bbase[\s-]?plate\b/,
      /\bhitch\b/,
      /\blight\s+kit/,
      /\bbraking\s+system/,
    ],
  },
  {
    category: 'mechanical',
    patterns: [
      /\baxle\b/,
      /\bbearing\b/,
      /\bbrake\b/,
      /\btransmission\b/,
      /\bdifferential\b/,
      /\bchassis\b/,
      /\btire\b/,
      /\bengine\b/,
    ],
  },
  {
    category: 'inspection',
    patterns: [/\binspect/],
  },
  {
    category: 'winterization',
    patterns: [/\bwinter/, /\banti[\s-]?freeze\b/, /de[\s-]?winter/],
  },
  {
    category: 'remodel',
    patterns: [/\bremodel\b/, /\bflooring\b/, /\bcabinet\b/, /\bcountertop\b/, /\bsubfloor\b/],
  },
  {
    category: 'fee',
    patterns: [
      /\btrip\s+fee/,
      /\bservice\s+call/,
      /\bmileage\b/,
      /\binspection\s+fee/,
      /\bconvenience\s+fee/,
    ],
  },
];

const KIND_PREFIXES = new Set(Object.keys(KIND_PREFIX_TO_KIND));

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Derive a stable internal id from the Zoho item name.
 *
 * "Labor - Mobile Service (Routine)" → "labor.mobile_service_routine"
 * "Parts - Roof membrane (per linear ft)" → "parts.roof_membrane_per_linear_ft"
 * "Inspection Fee" → "inspection_fee"
 * "Mobile Service Call Fee (Flat Rate) - 10 MILES" → "mobile_service_call_fee_flat_rate_10_miles"
 */
export function deriveId(name: string): string {
  const parts = name.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const firstSlug = slugify(parts[0] ?? '');
    if (KIND_PREFIXES.has(firstSlug)) {
      const rest = slugify(parts.slice(1).join(' '));
      return rest ? `${firstSlug}.${rest}` : firstSlug;
    }
  }
  return slugify(name);
}

export function deriveKind(name: string, productType: string | undefined): ItemKind {
  const firstChunk = name
    .split(/\s+-\s+/)[0]
    ?.trim()
    .toLowerCase();
  if (firstChunk && firstChunk in KIND_PREFIX_TO_KIND) {
    const k = KIND_PREFIX_TO_KIND[firstChunk];
    if (k) return k;
  }
  const lower = name.toLowerCase();
  if (/\b(fee|service\s+call|mileage)\b/.test(lower)) return 'fee';
  if (productType === 'service') return 'service';
  return 'part';
}

export function deriveUnit(name: string, kind: ItemKind): ItemUnit {
  const lower = name.toLowerCase();
  if (/per\s+linear\s+ft|\bper\s+ft\b/.test(lower)) return 'linear_ft';
  if (/per\s+sq(?:uare)?\.?\s*ft|\bsq\s*ft\b/.test(lower)) return 'sq_ft';
  if (/per\s+mile/.test(lower)) return 'mile';
  if (/\btube\b/.test(lower)) return 'tube';
  if (/per\s+(?:oz|ounce)/.test(lower)) return 'oz';
  if (/per\s+(?:lb|pound)/.test(lower)) return 'lb';
  if (kind === 'labor') return 'hour';
  if (kind === 'fee' || kind === 'discount') return 'flat';
  return 'each';
}

export function deriveCategory(name: string, kind: ItemKind): ServiceCategory {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(lower))) return rule.category;
  }
  if (kind === 'part') return 'parts';
  if (kind === 'labor') return 'labor';
  if (kind === 'fee') return 'fee';
  if (kind === 'discount') return 'discount';
  return 'parts';
}

export function deriveKeywords(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .replace(/[()/-]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

/**
 * Build a CatalogItem from a raw Zoho item. Pure — no I/O, deterministic.
 * The output is what `pnpm sync:catalog` writes into catalog.generated.ts.
 */
export function deriveCatalogItem(raw: RawZohoItem): CatalogItem {
  const kind = deriveKind(raw.name, raw.product_type);
  const unit = deriveUnit(raw.name, kind);
  const category = deriveCategory(raw.name, kind);
  const id = deriveId(raw.name);
  const keywords = deriveKeywords(raw.name);

  const item: CatalogItem = {
    id,
    name: raw.name,
    kind,
    unit,
    rate: Number(raw.rate) || 0,
    taxable: Boolean(raw.is_taxable),
    keywords,
    category,
    zohoItemId: raw.item_id,
  };
  if (raw.description?.trim()) item.description = raw.description.trim();
  if (raw.status === 'inactive') item.archived = true;
  return item;
}
