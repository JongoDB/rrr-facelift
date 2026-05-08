# 11 — Development Standards

## Repo Layout

See `planning/03-tech-stack.md` for the full structure. Two rules:

1. **Apps consume packages.** Apps in `apps/` may not depend on each other. They depend on shared code via `packages/`.
2. **Packages are pure libraries.** No top-level code, no env reads, no I/O at import time. Inject env via factory functions or constructors.

## Naming Conventions

- **Files:** `kebab-case.ts` for code, `PascalCase.tsx` for React components
- **Folders:** `kebab-case`
- **Variables/functions:** `camelCase`
- **Types/classes:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Zod schemas:** `<entity>Schema` (e.g., `intakeSchema`, `lineItemSchema`)
- **Catalog IDs:** `dotted.lower.snake` (e.g., `roof.reseal.peel_seal`)

## TypeScript

- `"strict": true` everywhere — no exceptions
- No `any`. Use `unknown` and narrow with type guards or zod parsing.
- No `// @ts-ignore` without an immediately following comment explaining why and a TODO with a planned removal.
- Prefer type inference over explicit annotations; annotate at function boundaries.
- Use `import type` for type-only imports.

## Validation

- Every external input goes through a zod schema before use.
- Schemas live in `packages/shared/src/schemas/` so they're reusable client + server.
- Use `.strict()` on objects to reject unknown fields.

## Error Handling

- Never swallow errors silently. If you catch and continue, log it.
- API responses follow a consistent shape: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`.
- HTTP status codes are correct (400 for validation, 401 for unauth, 403 for forbidden, 404 for not found, 409 for conflict, 5xx for server errors).
- User-facing error messages are plain English. Internal stack traces never reach the browser.

## Testing

| Type | Tool | Coverage target | Lives in |
|------|------|-----------------|----------|
| Unit | Vitest | ≥80% on `packages/`, ≥60% on `apps/` | Co-located: `*.test.ts` next to source |
| Component | Vitest + React Testing Library | Critical components only | Co-located |
| E2E | Playwright | Happy-path flows + 1-2 error paths each | `e2e/` at repo root |
| Integration (Zoho) | Vitest with real API calls | Each tool function | `packages/zoho-tools/integration/` |

Run before every commit:
```
pnpm test:unit
pnpm lint
pnpm typecheck
```

E2E and Zoho integration tests run in CI on PR (not pre-commit, to keep commits fast).

**Test data isolation:** Zoho integration tests use customer names tagged `[TEST]`. A `pnpm test:cleanup-zoho` script removes all `[TEST]` records.

## Git Workflow

### Branches

- `main` — always deployable
- `phase-NN/<short-description>` — phase-scoped feature branches (e.g., `phase-02/n8n-intake-flow`)
- `fix/<short-description>` — bug fixes
- `chore/<short-description>` — non-functional changes

### Commits

Conventional commits, single concern each:

```
feat(zoho): add create_estimate tool with line item validation

Wraps the Zoho Books Estimates API. Validates that catalog_item_id
exists in cache before submission. Adds unit tests for happy path
and rate-override path.
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `build`, `ci`.

Scopes are package or app names: `zoho`, `agent`, `web`, `pwa`, `api`, `infra`, `n8n`, etc.

### Pull Requests

- One logical change per PR (a feature, a bug fix, a refactor)
- PR title: `[Phase NN] <conventional-commit-style title>`
- Description includes:
  - What the PR does (1-2 sentences)
  - Why (link to phase plan or issue)
  - How to verify (manual steps if any)
  - Screenshots for UI changes
- All CI checks must pass before merge
- Squash merge preferred for feature branches; rebase merge for chores

### Reviews

In autonomous mode, Claude Code self-reviews via a checklist before merging:

- [ ] Tests added/updated for new behavior
- [ ] No `any` introduced
- [ ] No new lint warnings
- [ ] No secrets in diff
- [ ] Docs updated (READMEs, planning files if architectural)
- [ ] Breaking change clearly noted in PR description if any

## Security

### Secrets

- Never commit secrets. Pre-commit hook (gitleaks or similar) blocks pushes containing high-entropy strings or known patterns.
- Real secrets live in: Workers Secrets (`wrangler secret put`), n8n credentials (encrypted), `.env.local` (gitignored)
- `.env.example` files exist for every app/package with placeholder values and comments explaining what each var does

### Authentication

- All API endpoints (except `/auth/*` and webhook receivers with their own signature verification) require valid JWT cookie
- JWTs use HS256, 7-day expiry, rolling refresh on each authenticated request
- Magic link tokens are single-use, hashed at rest, expire after 15 minutes

### Webhooks

- All inbound webhooks verify signatures (Zoho HMAC, Twilio signature, etc.) BEFORE any side effect
- Failed verifications return 401 silently (don't tell attackers what was wrong)

### Input Validation

- All user input parsed via zod schemas
- File uploads: allowed MIME types only (image/jpeg, image/png, image/webp), 10MB max, virus scanned via R2 → optional ClamAV in n8n if needed

### Logging

- Log enough to debug, not enough to leak PII
- No customer phones/emails in app logs (use Zoho contact ID instead)
- Audit log table includes user email + tool name + result, but redacts sensitive payload fields

### Dependencies

- `pnpm audit` runs in CI; high/critical vulns block merge
- Renovate or Dependabot configured for weekly PRs of dep updates
- Pin major versions; allow minor + patch auto-updates

### Rate Limiting

- API Worker: per-IP rate limit on auth endpoints (5 req/min on `/auth/magic-link`)
- Public webhooks: per-IP rate limit (e.g., 60 req/min on `/webhook/intake`)
- Cloudflare's free WAF rules cover the obvious bot/abuse patterns

### Data Retention

- Magic link tokens: deleted 24h after expiry
- Intake submissions: kept indefinitely (small volume, useful for analytics)
- Tool call audit log: kept 90 days, then archived to R2 cold storage
- Customer data: retained per Zoho Books retention; we mirror but never store as system of record

## Documentation

Every package and app has a README with:
- One-paragraph description
- How to run locally (`pnpm dev`)
- How to test (`pnpm test`)
- Env vars required (link to `.env.example`)
- Public API (functions/components exported, if package)

Update planning docs (`planning/*.md`) when architectural decisions change. Treat planning docs as living spec, not write-once.

## CI/CD

GitHub Actions workflow:

- **On PR:** lint, typecheck, unit tests, Astro build (catches build errors early)
- **On merge to main:**
  - Apps deploy automatically: Cloudflare Pages auto-builds on push, Worker deploys via `wrangler deploy` in CI
  - Infra changes: `docker-compose.yml` and n8n workflow JSON changes are NOT auto-deployed; they require human (or owner) to run `docker compose up -d` on the VM. Notify via wrap-up.

## Performance Budgets

- Web (`apps/web/`): Lighthouse perf ≥95 mobile + desktop
- PWA (`apps/tech-pwa/`): Lighthouse perf ≥90 mobile, FCP <1.5s on Slow 3G
- API Worker p95 latency: <500ms (excluding upstream Zoho/Anthropic)
- End-to-end voice flow: <12s on GPU stack, <25s on CPU stack

If a phase wrap-up shows a budget regression, flag it as a watch-out.

## Accessibility

- WCAG AA on web and PWA
- Keyboard navigation works everywhere
- Form labels and ARIA where appropriate
- Color contrast verified by Lighthouse a11y checks

## Code Review Heuristics (Self-Review)

When Claude Code reviews its own PR before merging:

1. **Could a teammate understand this in 6 months?** If not, add a comment.
2. **Is anything magical?** (Implicit conventions, hidden side effects.) If yes, document or refactor.
3. **What did I cargo-cult from somewhere?** Check that the borrowed pattern actually fits.
4. **What's the failure mode?** What happens if Zoho/Claude/Speaches is down? What if the user closes the tab mid-mutation?
5. **Did I add a dependency?** If yes, is it justified, maintained, and small?

## Anti-Patterns to Avoid

- ❌ "We'll fix it later" comments without a tracked issue or TODO format
- ❌ Try/catch that catches everything and logs nothing
- ❌ Hardcoded URLs/paths/IDs that should be env config
- ❌ Premature abstractions (factories of factories of factories)
- ❌ Shared mutable state across tests
- ❌ Logging customer PII
- ❌ Silently dropping zod validation errors
- ❌ Network calls in component render bodies
- ❌ "It works, ship it" without a test
