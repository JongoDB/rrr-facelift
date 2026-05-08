# 05 — Service Catalog Data Model

> The catalog is the foundation. Voice extraction, intake classification, and quote generation all depend on it. Build it once, build it right.

## Source of Truth

- **Canonical catalog:** `packages/service-catalog/src/catalog.ts` (typed TS)
- **Mirror in Zoho Books:** items table (synced via `pnpm seed:catalog` script, idempotent)
- **Cache for fast reads:** Postgres `items` table (synced hourly from Zoho)

The TS file is edited by humans (or Claude with explicit approval). The seed script pushes additions/updates to Zoho. The hourly sync pulls Zoho item IDs back into the cache for use in Claude tool calls.

## Item Types

Every billable thing in Zoho Books is an "item." We categorize them locally:

```typescript
type ItemKind =
  | 'labor'        // billed per hour
  | 'service'      // fixed-price or per-unit (e.g., per linear ft of roof seam)
  | 'part'         // physical part with cost basis
  | 'fee'          // trip fee, after-hours surcharge, etc.
  | 'discount';    // referral, review, etc.
```

## Schema

```typescript
interface CatalogItem {
  /** Stable internal ID. Never change. Used in catalog references. */
  id: string;                          // e.g., "labor.standard"
  /** Human-readable name shown to customers on estimates/invoices */
  name: string;                        // e.g., "Standard Labor"
  kind: ItemKind;
  /** Unit shown on invoice line */
  unit: 'hour' | 'each' | 'linear_ft' | 'sq_ft' | 'mile' | 'tube' | 'oz' | 'lb' | 'flat';
  /** Default rate in USD. Some items have variable rates (override at line item time). */
  rate: number;
  /** True if rate is a starting point that techs commonly override */
  rateIsDefault?: boolean;
  /** Tax-applicable in NC */
  taxable: boolean;
  /** Free-text description for the line item; can include {placeholders} */
  description?: string;
  /** Keywords used for fuzzy matching in voice / intake AI extraction */
  keywords: string[];
  /** Service category for grouping in UI and filtering */
  category: ServiceCategory;
  /** Set after sync; never edited by hand */
  zohoItemId?: string;
  /** Optional warranty terms surfaced on estimate */
  warranty?: { months: number; covers: string };
  /** Soft-deleted? Don't show in pickers, keep for historical line items */
  archived?: boolean;
}

type ServiceCategory =
  | 'labor'
  | 'roof'
  | 'electrical'
  | 'plumbing'
  | 'mechanical'
  | 'appliance'   // AC, furnace, fridge, water heater
  | 'towing'      // base plate, brake systems, light kits
  | 'inspection'
  | 'remodel'
  | 'winterization'
  | 'water_damage'
  | 'parts'
  | 'fee'
  | 'discount';
```

## Initial Catalog Seed (must include)

These come directly from RRR's published pricing and Facebook posts. Claude Code seeds these in Phase 01.

### Labor & Fees

| ID | Name | Unit | Rate | Notes |
|----|------|------|------|-------|
| `labor.standard` | Standard Labor | hour | TBD by owner | 1-hour minimum enforced at quote level, not item |
| `labor.afterhours` | Emergency / After-Hours Labor | hour | TBD | Used for emergency mobile bookings |
| `fee.trip.local` | Local Service Call (≤10 mi) | flat | 99.00 | Auto-applied to mobile jobs |
| `fee.trip.mileage` | Additional Mileage | mile | 2.70 | Auto-applied for miles over 10 |
| `fee.parts_run.local` | Local Parts Run (during call) | hour | (matches labor) | Time billed at standard labor rate |
| `fee.parts_run.return_visit` | Return Visit for Ordered Parts | flat | (matches trip fee) | Charged when parts must be ordered |

### Roof Services

| ID | Name | Unit | Notes |
|----|------|------|-------|
| `roof.reseal.peel_seal` | Peel-and-Seal Reseal (EPDM/TPO) | linear_ft | 1-yr warranty; labor only, sealant separate |
| `roof.reseal.full` | Full Roof Reseal | flat | Pricing varies by roof type — rate is a starting estimate |
| `roof.membrane.replace` | Membrane Replacement (EPDM/TPO) | sq_ft | 2-yr warranty; labor only, materials separate |
| `roof.protrusion.reseal` | Protrusion Reseal (vent, antenna, AC) | each | |
| `parts.dicor_sl` | Dicor Self-Leveling Lap Sealant | tube | Pass-through cost + markup |
| `parts.eternabond` | EternaBond Tape | linear_ft | |

### Towing / Base Plate

Three phases, distinct line items:

| ID | Name | Unit | Notes |
|----|------|------|-------|
| `tow.baseplate.install` | Base Plate Installation (Phase 1) | flat | |
| `tow.brakes.install` | Braking System Installation (Phase 2) | flat | |
| `tow.lights.install` | Light Kit Installation (Phase 3) | flat | |
| `tow.complete_package` | Complete Towing Setup (all 3 phases) | flat | Bundle pricing if owner offers it |

### Electrical / Plumbing / Appliance

| ID | Name | Unit | Notes |
|----|------|------|-------|
| `elec.diagnostic` | Electrical Diagnostic | hour | Labor rate |
| `plumb.diagnostic` | Plumbing Diagnostic | hour | |
| `mech.diagnostic` | Mechanical Diagnostic | hour | |
| `appliance.ac.repair` | AC Repair | hour | |
| `appliance.furnace.repair` | Furnace Repair | hour | |
| `appliance.water_heater.repair` | Water Heater Repair | hour | |
| `parts.vent_gasket` | Vent Gasket | each | |
| `parts.butyl_tape` | Butyl Tape | linear_ft | |
| (more parts as needed) | | | Owner adds to catalog over time |

### Inspections

| ID | Name | Unit | Notes |
|----|------|------|-------|
| `inspect.full` | Full RV Inspection | flat | 24hr report turnaround |
| `inspect.walkthrough` | Complimentary Walkthrough | flat | $0 — included with inspection |

### Winterization & Water Damage

| ID | Name | Unit |
|----|------|------|
| `winter.complete` | Complete Winterization | flat |
| `winter.dewinter` | De-Winterization | flat |
| `water_damage.assessment` | Water Damage Assessment | hour |
| `water_damage.repair` | Water Damage Repair | hour |

### Discounts

| ID | Name | Unit | Rate |
|----|------|------|------|
| `discount.review` | Google Review Discount (10%) | flat | -10% (applied at totals level, not line) |
| `discount.referral` | Referral Discount | flat | -50.00 |

> **Owner action required in Phase 01:** confirm/set actual rates for `labor.standard`, `labor.afterhours`, and rate ranges for service categories. Mark items in seed with `TODO_RATE` if rate is unknown — Claude Code prompts in wrap-up.

## Pricing Rules (computed, not stored as items)

Rules applied at quote generation time, not line items themselves:

```typescript
interface QuoteRules {
  // 1-hour labor minimum across all labor lines
  laborMinimumHours: 1.0;

  // Mileage logic
  mileage: {
    freeRadiusMiles: 10;
    ratePerMileOver: 2.70;
    originAddress: string;  // shop address, env config
  };

  // Mobile-only adders
  mobile: {
    requiresTripFee: true;          // adds fee.trip.local
    advanceNoticeDays: 3;           // unless emergency
    paymentDueHoursBefore: 24;
  };

  // Tax (NC sales tax on parts; labor non-taxable)
  taxRate: number;  // NC state + Rowan County, owner-confirms
}
```

## Voice Extraction Mapping

The `keywords` field on each item drives the AI extraction layer. Examples:

```typescript
{
  id: 'roof.reseal.peel_seal',
  keywords: ['reseal', 'peel and seal', 'lap sealant', 'sealed seams', 'sealed roof', 'roof sealing']
},
{
  id: 'parts.dicor_sl',
  keywords: ['dicor', 'self leveling', 'self-leveling', 'lap sealant tube', 'roof sealant tube']
},
{
  id: 'parts.vent_gasket',
  keywords: ['vent gasket', 'vent gaskets', 'gasket on the vent']
}
```

When Claude receives a voice transcript, the system prompt includes the catalog with keywords. Claude maps phrases like *"used a tube and a half of Dicor"* → `parts.dicor_sl × 1.5` and *"replaced two vent gaskets"* → `parts.vent_gasket × 2`.

## Sync to Zoho Books

`pnpm seed:catalog` script:

1. Loads `catalog.ts`
2. For each item, checks Zoho Books `/items` for existing item with matching name
3. If exists: updates rate, description, taxable flag (preserves Zoho item ID)
4. If new: creates Zoho item, captures returned ID, writes back to `catalog.ts` (or to a `.zoho-ids.json` lockfile)
5. Logs additions/updates/skips

**Idempotency rule:** running the script twice with no changes produces zero writes to Zoho. Hash the catalog and skip if unchanged.

## Adding New Items

When a tech says something the catalog can't map, the wrap-up should flag it:

> **Catalog gap detected (Phase 05):** "spray foam in the slide-out floor" doesn't match any catalog item. Recommend adding `repair.slide_out.foam` with keywords `["spray foam", "slide out floor", "slide-out foam"]`.

Owner decides whether to add. Don't auto-add — the catalog is the source of truth and grows deliberately.
