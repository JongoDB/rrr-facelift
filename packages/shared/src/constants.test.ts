import { describe, expect, it } from 'vitest';
import {
  LABOR_MINIMUM_HOURS,
  MILEAGE_FREE_RADIUS_MILES,
  MILEAGE_RATE_PER_MILE_OVER,
  REVIEW_DISCOUNT_RATE,
} from './constants.js';

describe('business constants', () => {
  it('matches values codified in planning/05-service-catalog.md', () => {
    expect(LABOR_MINIMUM_HOURS).toBe(1);
    expect(MILEAGE_FREE_RADIUS_MILES).toBe(10);
    expect(MILEAGE_RATE_PER_MILE_OVER).toBe(2.7);
    expect(REVIEW_DISCOUNT_RATE).toBe(0.1);
  });
});
