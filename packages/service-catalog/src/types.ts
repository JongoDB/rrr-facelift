/**
 * Catalog data model — locked spec in planning/05-service-catalog.md.
 * Any change here is a change to the Zoho-mirroring contract; update the seed script in lockstep.
 */

export type ItemKind = 'labor' | 'service' | 'part' | 'fee' | 'discount';

export type ItemUnit =
  | 'hour'
  | 'each'
  | 'linear_ft'
  | 'sq_ft'
  | 'mile'
  | 'tube'
  | 'oz'
  | 'lb'
  | 'flat';

export type ServiceCategory =
  | 'labor'
  | 'roof'
  | 'electrical'
  | 'plumbing'
  | 'mechanical'
  | 'appliance'
  | 'towing'
  | 'inspection'
  | 'remodel'
  | 'winterization'
  | 'water_damage'
  | 'parts'
  | 'fee'
  | 'discount';

export interface CatalogWarranty {
  months: number;
  covers: string;
}

export interface CatalogItem {
  /** Stable internal ID. Never change. Used in catalog references. */
  id: string;
  /** Human-readable name shown to customers on estimates/invoices. */
  name: string;
  kind: ItemKind;
  unit: ItemUnit;
  /** Default rate in USD. Some items have variable rates (override at line item time). */
  rate: number;
  /** True if rate is a starting point that techs commonly override. */
  rateIsDefault?: boolean;
  /** Tax-applicable in NC (typically true for parts, false for labor). */
  taxable: boolean;
  /** Free-text description for the line item; can include {placeholders}. */
  description?: string;
  /** Keywords used for fuzzy matching in voice / intake AI extraction. */
  keywords: string[];
  category: ServiceCategory;
  /** Set after sync; never edited by hand. */
  zohoItemId?: string;
  warranty?: CatalogWarranty;
  /** Soft-deleted? Don't show in pickers, keep for historical line items. */
  archived?: boolean;
  /** Marker for items where the owner still needs to confirm/set the rate. */
  rateNeedsConfirmation?: boolean;
}

export interface QuoteRules {
  laborMinimumHours: number;
  mileage: {
    freeRadiusMiles: number;
    ratePerMileOver: number;
    /** Shop address; resolved at runtime via env var SHOP_ADDRESS. */
    originAddressEnvVar: string;
  };
  mobile: {
    requiresTripFee: boolean;
    advanceNoticeDays: number;
    paymentDueHoursBefore: number;
  };
  /** NC state + Rowan County. Owner confirms exact rate in Phase 01. */
  taxRate: number;
}
