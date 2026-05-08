import {
  LABOR_MINIMUM_HOURS,
  MILEAGE_FREE_RADIUS_MILES,
  MILEAGE_RATE_PER_MILE_OVER,
  MOBILE_ADVANCE_NOTICE_DAYS,
  MOBILE_PAYMENT_DUE_HOURS_BEFORE,
} from '@rrr/shared';
import { GENERATED_CATALOG } from './catalog.generated.js';
import type { CatalogItem, QuoteRules } from './types.js';

/**
 * The local catalog mirror — sourced from RRR's Zoho Books org via
 * `pnpm sync:catalog`. Zoho is canonical; this file re-exports the generated
 * snapshot and layers on derived helpers and the QUOTE_RULES that govern
 * client-side preview totals.
 *
 * To refresh after Zoho-side edits: `pnpm sync:catalog && pnpm test`.
 */
export const CATALOG: readonly CatalogItem[] = GENERATED_CATALOG;

export const QUOTE_RULES: QuoteRules = {
  laborMinimumHours: LABOR_MINIMUM_HOURS,
  mileage: {
    freeRadiusMiles: MILEAGE_FREE_RADIUS_MILES,
    ratePerMileOver: MILEAGE_RATE_PER_MILE_OVER,
    originAddressEnvVar: 'SHOP_ADDRESS',
  },
  mobile: {
    requiresTripFee: true,
    advanceNoticeDays: MOBILE_ADVANCE_NOTICE_DAYS,
    paymentDueHoursBefore: MOBILE_PAYMENT_DUE_HOURS_BEFORE,
  },
  // NC state + Rowan County combined rate. Zoho Books is the system of record
  // for tax application; this constant is for client-side preview totals only.
  taxRate: 0.0675,
};

/** Look up a catalog item by its derived internal id (e.g. `inspection_fee`). */
export function findById(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

/** Look up a catalog item by its Zoho item_id (the field Zoho returns on lines). */
export function findByZohoItemId(zohoItemId: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.zohoItemId === zohoItemId);
}

/**
 * Items where the owner has not yet set a real rate. With the Zoho-canonical
 * model this should always be empty in practice — kept as a safety net so the
 * test suite catches the case where sync ever produces a zero-rate billable
 * item that wasn't intentional (Zoho's `Labor - NO CHARGE` is intentional).
 */
export function itemsNeedingRates(): readonly CatalogItem[] {
  return CATALOG.filter((item) => item.rateNeedsConfirmation === true);
}
