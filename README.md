# RRR Automation — Planning Bundle

Everything Claude Code needs to autonomously build the RRR automation platform, organized so the human owner only intervenes when genuinely necessary.

## What's in here

```
rrr-automation-planning/
├── CLAUDE.md                   ← Claude Code reads this first; project constitution
├── KICKOFF_PROMPT.md           ← Paste this into Claude Code on session 1
├── STATUS.md                   ← Running phase tracker; updated after each phase
├── README.md                   ← This file
├── planning/                   ← Locked specs and decisions
│   ├── 01-overview.md          ← Vision, business context, success criteria
│   ├── 02-architecture.md      ← System design, component map, data flow
│   ├── 03-tech-stack.md        ← Locked tech choices + rationale (ADRs)
│   ├── 04-phases.md            ← 7-phase delivery plan with exit criteria
│   ├── 05-service-catalog.md   ← Service/parts/pricing data model
│   ├── 06-zoho-integration.md  ← Zoho Books OAuth + Claude tool definitions
│   ├── 07-n8n-workflows.md     ← Inventory of automation flows
│   ├── 08-tech-pwa-spec.md     ← Tech-facing voice + chat PWA
│   ├── 09-website-migration.md ← Squarespace → Astro → Cloudflare Pages
│   ├── 10-infrastructure.md    ← VM, Docker Compose, Cloudflare Tunnel
│   ├── 11-dev-standards.md     ← Repo layout, conventions, testing, security
│   ├── 12-human-actions.md     ← Things ONLY the human can do (per phase)
│   └── 13-secrets-manifest.md  ← Every credential/env var, where it lives
├── templates/
│   └── PHASE_WRAPUP.md         ← Format for end-of-phase handoff to human
└── wrapups/                    ← Filled-in wrapups land here as work completes
```

## How to use this

1. **Read** `planning/01-overview.md` to confirm the project description matches what you want.
2. **Skim** `planning/04-phases.md` to understand the delivery sequence.
3. **Adjust** anything that doesn't match your intent — these docs are the source of truth Claude Code will follow.
4. **Initialize** a new repo at the top level (this folder becomes the repo root, or move these files into a fresh repo).
5. **Open Claude Code** in the repo directory.
6. **Paste** `KICKOFF_PROMPT.md` into Claude Code.
7. **Wait** for the wrap-up file. Read it. Complete any human actions it requested. Tell Claude Code to proceed to the next phase.

## When you read a wrap-up

Wrap-ups follow `templates/PHASE_WRAPUP.md`. The sections that matter most:
- **Delivered** — what's done and verifiable
- **Blocked On** — what you (the human) need to provide
- **Recommended Next** — the proposed next phase or course correction
- **Defer List** — things intentionally pushed out

Everything else is supporting detail you can skip unless you're curious.

## Updating these docs

These planning docs are version-controlled with the project. As you learn things or change direction, edit the relevant `planning/*.md` file and commit. Claude Code will pick up changes on the next session because `CLAUDE.md` re-imports them.
