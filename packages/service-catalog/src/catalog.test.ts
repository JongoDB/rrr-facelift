import { describe, expect, it } from 'vitest';
import { CATALOG, findById, findByZohoItemId, itemsNeedingRates, QUOTE_RULES } from './catalog.js';

describe('service catalog (Zoho-mirror)', () => {
  it('is a non-empty mirror of the live Zoho org', () => {
    expect(CATALOG.length).toBeGreaterThan(100);
  });

  it('has unique internal ids after collision suffixing', () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every active item carries a Zoho item id (round-trip via findByZohoItemId)', () => {
    const sample = CATALOG.find((item) => item.zohoItemId !== undefined);
    expect(sample).toBeDefined();
    if (!sample?.zohoItemId) throw new Error('expected a Zoho id on at least one item');
    expect(findByZohoItemId(sample.zohoItemId)?.id).toBe(sample.id);
  });

  it('every item declares at least one keyword for AI extraction', () => {
    const offenders = CATALOG.filter((item) => item.keywords.length === 0);
    expect(offenders).toEqual([]);
  });

  it('contains the canonical mobile-service line items observed in the audit', () => {
    expect(findById('labor.mobile_service_routine')).toBeDefined();
    expect(
      CATALOG.find((i) =>
        i.id.startsWith('labor.mobile_service_routine_appointment_with_service_call_fee'),
      ),
    ).toBeDefined();
    expect(findById('mobile_service_call_fee_flat_rate_10_miles')).toBeDefined();
    expect(findById('mobile_service_call_fee_per_mile_over_10_miles')).toBeDefined();
    expect(findById('inspection_fee')).toBeDefined();
  });

  it('flags zero items as needing rates after sync', () => {
    expect(itemsNeedingRates()).toEqual([]);
  });

  it('quote rules carry locked-spec values', () => {
    expect(QUOTE_RULES.laborMinimumHours).toBe(1);
    expect(QUOTE_RULES.mileage.freeRadiusMiles).toBe(10);
    expect(QUOTE_RULES.mileage.ratePerMileOver).toBe(2.7);
    expect(QUOTE_RULES.taxRate).toBe(0.0675);
  });
});
