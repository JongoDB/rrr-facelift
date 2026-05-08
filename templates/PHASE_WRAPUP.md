# Phase NN — <Short Name> — Wrap-up

> **For the human owner.** Read top to bottom; everything below "Delivered" is supporting detail.

**Phase status:** ✅ complete | 🔴 blocked | ⏸️ partial-deferred
**Date:** YYYY-MM-DD
**Branch / PRs:** `phase-NN/<branch>` · #<pr-number>, #<pr-number>
**Time spent:** X hours active engineering

---

## TL;DR

One sentence on what got done, one sentence on what's needed from you next.

---

## Delivered

Bulleted list of features/components shipped in this phase. Each item is verifiable — points to a file, a URL, a screenshot, or a test that proves it works.

- [x] <Feature> — <link to PR / file / URL>
- [x] <Feature> — <link>

---

## Blocked On (Human Required)

What I need you to do before the next phase can start. Skip this section if nothing is blocked.

| # | Item | Why it requires a human | How to provide |
|---|------|--------------------------|----------------|
| 1 | <e.g., Zoho OAuth refresh token for production org> | Requires account login | <link to setup steps in planning/13-secrets-manifest.md or fresh instructions> |
| 2 | <e.g., Approval of intake form copy> | Subjective / brand voice | Review `apps/web/content/forms/intake.md` and edit or 👍 |

---

## Recommended Next

The proposed next phase per `planning/04-phases.md`, OR a course correction with rationale.

- **Proposed:** Phase NN+1 — <name>
- **Rationale:** <one or two lines>
- **Estimated effort:** <hours or "session-sized">
- **Prerequisites:** <any of the Blocked On items? other dependencies?>

---

## Defer List

Things I intentionally did not do this phase, and why. These should be revisited later or formally dropped.

| Item | Reason deferred | Suggested phase to revisit |
|------|-----------------|-----------------------------|
| <e.g., Webhook signature rotation automation> | Out of scope for MVP | Phase 06 polish |

---

## Decisions Made

ADR-style record of any non-obvious choices made during the phase. If a decision contradicts `planning/03-tech-stack.md`, flag it loudly and propose updating the doc.

- **Decision:** <what>
- **Alternatives considered:** <what else>
- **Why:** <rationale>
- **Reversibility:** easy / medium / hard

---

## Tests & Verification

How I confirmed the phase works. Not exhaustive — just enough that you can sanity-check.

- Unit tests: `pnpm test` — <X passing, Y new>
- E2E / integration: <what was run, results, link to CI run if applicable>
- Manual verification: <e.g., "submitted test intake form, received SMS within 4s, draft estimate created in Zoho with correct line items">
- Screenshots / recordings: <links if relevant>

---

## Risks & Watch-outs

Things that aren't blockers but the human should be aware of.

- <e.g., "Speaches CPU transcription is slower than expected; will revisit GPU offload in Phase 05">
- <e.g., "Zoho Books API rate limit was hit once during seeding; throttling is in place but watch this in production">

---

## Stats

- Lines of code added: <n>
- Files touched: <n>
- New dependencies: <list, with brief justification>
- New env vars / secrets: <list — also added to `planning/13-secrets-manifest.md`>

---

## Files / Links Reference

Quick index of the most important artifacts from this phase.

- Code entrypoint: `<path>`
- Config: `<path>`
- Docs added/updated: `<paths>`
- Demo URL (if any): `<url>`
- Related issues / discussions: `<links>`

---

*Generated at end of phase. Next session should start from `STATUS.md` to pick up the trail.*
