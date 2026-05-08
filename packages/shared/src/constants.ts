/**
 * Business-rule constants. Sourced from planning/05-service-catalog.md.
 * Anything that affects pricing, mileage, or quoting lives here so changes happen in one place.
 */

export const LABOR_MINIMUM_HOURS = 1.0;

export const MILEAGE_FREE_RADIUS_MILES = 10;
export const MILEAGE_RATE_PER_MILE_OVER = 2.7;

export const MOBILE_ADVANCE_NOTICE_DAYS = 3;
export const MOBILE_PAYMENT_DUE_HOURS_BEFORE = 24;

export const REVIEW_DISCOUNT_RATE = 0.1;

/** Phone uploads constraints — used by intake form + Worker upload signer. */
export const PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_UPLOAD_MAX_COUNT = 5;
export const PHOTO_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Session token lifetime for the tech PWA. */
export const TECH_SESSION_TTL_DAYS = 7;
export const MAGIC_LINK_TTL_MINUTES = 15;
