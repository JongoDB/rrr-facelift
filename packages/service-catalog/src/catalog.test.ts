import { describe, expect, it } from 'vitest';
import { CATALOG, findById, itemsNeedingRates, QUOTE_RULES } from './catalog.js';

describe('service catalog', () => {
  it('has unique ids', () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item declares at least one keyword', () => {
    const offenders = CATALOG.filter((item) => item.keywords.length === 0);
    expect(offenders).toEqual([]);
  });

  it('findById round-trips', () => {
    const found = findById('labor.standard');
    expect(found?.name).toBe('Standard Labor');
  });

  it('flags items still needing owner-confirmed rates (Phase 01 prompt)', () => {
    expect(itemsNeedingRates().length).toBeGreaterThan(0);
  });

  it('quote rules carry locked-spec values', () => {
    expect(QUOTE_RULES.laborMinimumHours).toBe(1);
    expect(QUOTE_RULES.mileage.freeRadiusMiles).toBe(10);
    expect(QUOTE_RULES.mileage.ratePerMileOver).toBe(2.7);
  });
});
