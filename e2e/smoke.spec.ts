import { expect, test } from '@playwright/test';

// Phase 00 smoke test — verifies Playwright config loads and basic assertions work.
// Replaced in Phase 03 with real flows against the deployed Astro site.
test('playwright smoke', async () => {
  expect(2 + 2).toBe(4);
});
