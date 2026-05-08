import { describe, expect, it } from 'vitest';
import {
  deriveCatalogItem,
  deriveCategory,
  deriveId,
  deriveKeywords,
  deriveKind,
  deriveUnit,
  type RawZohoItem,
  slugify,
} from './derive.js';

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with underscore, trims', () => {
    expect(slugify('Mobile Service (Routine)')).toBe('mobile_service_routine');
    expect(slugify('On-Site / Drop-Off')).toBe('on_site_drop_off');
    expect(slugify('   trim   me   ')).toBe('trim_me');
  });
});

describe('deriveId', () => {
  it('uses dotted prefix.rest for known kind prefixes', () => {
    expect(deriveId('Labor - Mobile Service (Routine)')).toBe('labor.mobile_service_routine');
    expect(deriveId('Parts - Roof membrane (per linear ft)')).toBe(
      'parts.roof_membrane_per_linear_ft',
    );
    expect(deriveId('Sub - Power steering / hydro boost repair')).toBe(
      'sub.power_steering_hydro_boost_repair',
    );
    expect(deriveId('Discount - Referral')).toBe('discount.referral');
  });

  it('slugs the whole name when prefix is not a known kind', () => {
    expect(deriveId('Inspection Fee')).toBe('inspection_fee');
    expect(deriveId('Mobile Service Call Fee (Flat Rate) - 10 MILES')).toBe(
      'mobile_service_call_fee_flat_rate_10_miles',
    );
  });
});

describe('deriveKind', () => {
  it('maps prefix to kind', () => {
    expect(deriveKind('Labor - Anything', 'service')).toBe('labor');
    expect(deriveKind('Parts - Anything', 'goods')).toBe('part');
    expect(deriveKind('Sub - Anything', 'service')).toBe('service');
    expect(deriveKind('Discount - Anything', 'goods')).toBe('discount');
  });

  it('detects fee from name keywords without a prefix', () => {
    expect(deriveKind('Inspection Fee', 'service')).toBe('fee');
    expect(deriveKind('Mobile Service Call Fee (Flat Rate) - 10 MILES', 'service')).toBe('fee');
    expect(deriveKind('Mobile Service Call Fee (Per Mile) - OVER 10 MILES', 'service')).toBe('fee');
  });

  it('falls back to product_type when no prefix or keyword matches', () => {
    expect(deriveKind('Convenience Fee (3%)', 'service')).toBe('fee');
    expect(deriveKind('Random label', 'service')).toBe('service');
    expect(deriveKind('Random label', 'goods')).toBe('part');
  });
});

describe('deriveUnit', () => {
  it('parses common per-unit phrases out of names', () => {
    expect(deriveUnit('Parts - Roof membrane (per linear ft)', 'part')).toBe('linear_ft');
    expect(deriveUnit('Mobile Service Call Fee (Per Mile) - OVER 10 MILES', 'fee')).toBe('mile');
    expect(deriveUnit('Parts - Dicor Self-Leveling Lap Sealant (tube)', 'part')).toBe('tube');
  });

  it('defaults by kind when no per-unit phrase is present', () => {
    expect(deriveUnit('Labor - Mobile Service (Routine)', 'labor')).toBe('hour');
    expect(deriveUnit('Mobile Service Call Fee (Flat Rate) - 10 MILES', 'fee')).toBe('flat');
    expect(deriveUnit('Discount - Referral', 'discount')).toBe('flat');
    expect(deriveUnit('Parts - Vent gasket', 'part')).toBe('each');
  });
});

describe('deriveCategory', () => {
  it('matches roof items', () => {
    expect(deriveCategory('Labor - Roof Reseal', 'labor')).toBe('roof');
    expect(deriveCategory('Parts - Roof membrane (per linear ft)', 'part')).toBe('roof');
    expect(deriveCategory('Parts - Dicor Lap Sealant', 'part')).toBe('roof');
  });

  it('matches mobile fees and other fees', () => {
    expect(deriveCategory('Mobile Service Call Fee (Flat Rate) - 10 MILES', 'fee')).toBe('fee');
    expect(deriveCategory('Inspection Fee', 'fee')).toBe('inspection');
  });

  it('falls back to kind-based category', () => {
    expect(deriveCategory('Random Generic Item', 'part')).toBe('parts');
    expect(deriveCategory('Random Generic Item', 'labor')).toBe('labor');
  });
});

describe('deriveKeywords', () => {
  it('extracts non-stopword tokens, dedupes, lowercases', () => {
    const kw = deriveKeywords('Labor - Mobile Service (Routine)');
    expect(kw).toContain('mobile');
    expect(kw).toContain('service');
    expect(kw).toContain('routine');
    expect(kw).toContain('labor');
    expect(kw).not.toContain('the');
  });

  it('drops parenthesis content as separate tokens', () => {
    const kw = deriveKeywords('Parts - Roof membrane (per linear ft)');
    expect(kw).toContain('roof');
    expect(kw).toContain('membrane');
    expect(kw).toContain('linear');
    expect(kw).toContain('ft');
    expect(kw).not.toContain('per'); // stopword
  });
});

describe('deriveCatalogItem (end-to-end)', () => {
  it('maps a real RRR labor service correctly', () => {
    const raw: RawZohoItem = {
      item_id: '123',
      name: 'Labor - Mobile Service (Routine)',
      rate: 129,
      is_taxable: false,
      product_type: 'service',
      status: 'active',
      description: 'Service Disclaimer: …',
    };
    const item = deriveCatalogItem(raw);
    expect(item).toMatchObject({
      id: 'labor.mobile_service_routine',
      name: 'Labor - Mobile Service (Routine)',
      kind: 'labor',
      unit: 'hour',
      category: 'labor',
      rate: 129,
      taxable: false,
      zohoItemId: '123',
    });
    expect(item.archived).toBeUndefined();
    expect(item.keywords).toContain('mobile');
    expect(item.description).toContain('Service Disclaimer');
  });

  it('marks inactive items as archived', () => {
    const item = deriveCatalogItem({
      item_id: '999',
      name: 'Labor - Mechanical Diag/Repair AFTER HOURS',
      rate: 159,
      is_taxable: false,
      product_type: 'service',
      status: 'inactive',
    });
    expect(item.archived).toBe(true);
  });
});
