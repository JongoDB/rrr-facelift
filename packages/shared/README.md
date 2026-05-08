# @rrr/shared

Cross-workspace types, zod schemas, and constants used by every app and package in the monorepo.

## Why this exists

- Zod schemas defined here are **the source of truth** for both client (forms in `apps/web`, PWA in `apps/tech-pwa`) and server (`apps/api`, n8n) validation.
- Constants (e.g., `LABOR_MINIMUM_HOURS`, `MILEAGE_FREE_RADIUS`) live here so business rules are not duplicated across workspaces.
- Pure TypeScript — no runtime side effects, no env reads at import time.

## Exports

- `@rrr/shared` — top-level (re-exports schemas + constants)
- `@rrr/shared/schemas` — zod schemas only
- `@rrr/shared/constants` — runtime constants only

## Adding a schema

1. Add `src/schemas/<name>.ts` exporting both the schema and the inferred type.
2. Re-export from `src/schemas/index.ts`.
3. Add tests in `src/schemas/<name>.test.ts`.
