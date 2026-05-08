# @rrr/service-catalog

Typed catalog of RRR Custom RV services, parts, fees, labor, and pricing rules.

## Source of truth

This package is **the** canonical catalog. The Zoho Books items table is a mirror, synced via `pnpm seed:catalog` (Phase 01).

When AI extracts line items from a tech voice transcript, it maps phrases against this catalog's `keywords` field. Adding new items, keywords, or categories happens here first, then propagates to Zoho.

## Layout

- `src/types.ts` — `CatalogItem`, `ItemKind`, `ServiceCategory`, `QuoteRules` (locked in planning/05-service-catalog.md)
- `src/catalog.ts` — the actual seed data (initial entries from planning docs; expanded in Phase 01)
- `src/index.ts` — re-exports

## Adding an item

1. Add an entry to `src/catalog.ts` with a stable, dotted `id` (e.g., `roof.reseal.peel_seal`).
2. Add at least 3 search keywords covering common phrasings.
3. Set `rateIsDefault: true` if the rate is a starting point techs commonly override.
4. Run `pnpm seed:catalog` (Phase 01) to push to Zoho — captures the `zohoItemId` back into the catalog.

## Phase 00 status

Type system and a starter slice of items are in place. Full Zoho-rate confirmation, missing categories, and the seed/sync scripts land in **Phase 01**.
