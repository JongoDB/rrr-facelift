# 03 — Tech Stack (Locked Decisions)

> These are decided. Do not re-litigate without writing an ADR proposal in a phase wrap-up. Each entry includes rationale so you can defend the choice if circumstances change.

## Languages & Runtimes

| Layer | Choice | Rationale |
|-------|--------|-----------|
| All TS code | **TypeScript 5.x** strict mode | Single language across web, worker, PWA, tooling |
| Node version | **Node 20 LTS** | Cloudflare Workers compatibility, stable until 2026 |
| Package manager | **pnpm 9.x** | Fast, disk-efficient, workspaces are first-class |
| Python (Speaches/scripts) | **3.11+** | Whisper ecosystem requirement |

## Frontend

| Need | Choice | Why not the alternatives |
|------|--------|--------------------------|
| Marketing site | **Astro** | Static-first, minimal JS, excellent SEO, AI crawlers love it. Not Next.js — overkill for content site. Not 11ty — Astro's component model wins for the intake form island. |
| Tech PWA | **Vite + React 18 + Hono** | React is universal hireable knowledge. Vite is faster than Next dev. Hono is a tiny edge-first router that runs on Workers. Not Next.js — App Router complexity not justified, and Cloudflare Pages Functions + Workers gives us better edge story. |
| Styling | **Tailwind CSS** | Productivity, no naming bikeshed, Astro + React + Tailwind is well-trodden path |
| UI primitives | **shadcn/ui (radix-based)** | Copy-in components, no runtime cost, accessible by default |
| Forms | **react-hook-form + zod** | Type-safe validation, the industry default |
| State (PWA) | **Zustand** for client state, **TanStack Query** for server state | Don't reach for Redux. TanStack handles caching/retry/refetch. |

## Backend / Edge

| Need | Choice | Rationale |
|------|--------|-----------|
| API runtime | **Cloudflare Workers + Hono** | Free tier covers our volume. Edge means low latency from anywhere. Hono is Express-like, runs in Workers/Node/Bun identically — tests run in Node, prod runs at edge. |
| Validation | **zod** | Shared schemas client + server. Type inference is the productivity win. |
| Database access | **Drizzle ORM** | Type-safe, lightweight, plays nicely with Workers via HTTP-based Postgres drivers. Not Prisma — engine binary doesn't fit Workers cleanly. |
| Postgres driver | **postgres-js** (or `@neondatabase/serverless` if Neon used) | HTTP-friendly, edge-compatible |

## Self-Hosted Services

| Need | Choice | Rationale |
|------|--------|-----------|
| Workflow automation | **n8n** (self-hosted, Docker) | Closest UX to Zoho Flow. 400+ pre-built nodes. HTTP Request node + OAuth2 credentials handles any Zoho endpoint. Generous fair-code license. |
| Speech-to-text | **Speaches** (faster-whisper-server) | OpenAI-compatible `/v1/audio/transcriptions` API — code stays portable. Faster-whisper is 4x faster than vanilla Whisper via CTranslate2. |
| Local LLM (optional) | **Ollama** + `qwen2.5:14b` or similar | Async tasks where Claude API isn't worth the cost (intake summarization, draft email writing). Skip if no GPU; Claude API is cheap enough. |
| Postgres | **Postgres 16** in Docker | n8n's recommended DB, plus our cached item catalog and audit log |
| Reverse proxy (internal) | **Caddy** | Auto HTTPS for internal Tunnel routing, simpler config than nginx |

## Cloud Services

| Need | Choice | Free tier sufficient? |
|------|--------|------------------------|
| Hosting (sites + workers) | **Cloudflare Pages + Workers** | Yes — 100k requests/day on Workers, unlimited Pages traffic |
| DNS / CDN / SSL | **Cloudflare** | Yes |
| Tunnel from VM | **Cloudflare Tunnel** (`cloudflared`) | Yes — free for unlimited tunnels |
| AI inference (primary) | **Anthropic API — Claude Sonnet 4.6** | No, but cheap. Estimated $5-20/mo. Sonnet 4.6 is the default for tool-use loops (fast, smart, cheap). Opus 4.7 reserved for complex reasoning escalations. |
| AI inference (fallback) | **Anthropic API — Claude Haiku 4.5** | For high-frequency, low-complexity calls (e.g., classifying intake form keywords). Cheaper than Sonnet, often sufficient. |
| Email (transactional) | **Resend** | Yes — 3k/mo free, plenty for magic links + customer notifications |
| SMS | **Twilio** | No, but cheap (~$1 setup + $0.0079/SMS US). No free alternative comparable in reliability. |

## Why Anthropic API Specifically

- Native tool-use with strict JSON schema enforcement → reliable structured output for line items
- Streaming responses → tech sees Claude "thinking" in real time during voice flow
- Higher quality on multi-step agentic loops than open alternatives at this writing
- Cost at our volume is $5-20/mo, not worth optimizing away

The Anthropic SDK call pattern (`messages.create` with `tools` array) is encapsulated in `packages/agent/` so it's swappable later if economics change.

## Auth

| Need | Choice | Why |
|------|--------|-----|
| Tech app auth | **Magic links via Resend** | Small team (likely <10 techs ever). No password reset flows to build. |
| Session tokens | **JWT signed with HS256**, stored in httpOnly cookies | Simple, stateless, works on edge |
| OAuth (Zoho) | Stored in **Workers Secrets** + n8n credentials | Both encrypted at rest. Refresh tokens never appear in code or logs. |

## Build / Test / CI

| Need | Choice | Rationale |
|------|--------|-----------|
| Test runner | **Vitest** | Vite-native, jest-compatible API, fast |
| E2E tests | **Playwright** | Industry standard. Same tool we use for the Squarespace snapshot. |
| Linter | **Biome** | Fast (Rust), one tool replaces eslint+prettier |
| CI | **GitHub Actions** | Free for public repos; private repos have generous free minutes |
| Deploy (sites/workers) | **Wrangler CLI** via GH Actions | Cloudflare's official tool |

## Repo Layout (Monorepo)

```
rrr-automation/                     ← repo root (planning files live here)
├── CLAUDE.md
├── STATUS.md
├── README.md
├── KICKOFF_PROMPT.md
├── planning/
├── templates/
├── wrapups/
├── package.json                    ← workspaces root
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                        ← Astro marketing site
│   ├── tech-pwa/                   ← Vite + React PWA
│   └── api/                        ← Cloudflare Worker (Hono)
├── packages/
│   ├── zoho-tools/                 ← Claude tool definitions + Zoho API wrappers
│   ├── service-catalog/            ← Service/parts schema + sample data
│   ├── agent/                      ← Anthropic SDK wrapper, prompt templates
│   └── shared/                     ← Cross-package types (zod schemas, constants)
├── infra/
│   ├── docker-compose.yml          ← n8n + speaches + postgres + cloudflared
│   ├── n8n/
│   │   └── workflows/              ← exported workflow JSON, version-controlled
│   ├── caddy/
│   └── cloudflared/
└── scripts/
    ├── snapshot-squarespace.mjs    ← Playwright migration helper
    ├── seed-service-catalog.mjs
    └── ...
```

## What We Are NOT Using

These were considered and rejected. Don't switch to them without strong evidence.

| Rejected | Why not |
|----------|---------|
| Next.js (full app) | App Router complexity, server actions awkward at edge |
| Supabase (managed) | We have a VM; self-hosted Postgres is free |
| Prisma | Engine binary doesn't fit cleanly in Workers |
| OpenAI Whisper API (cloud) | We have local infra; "free" hard requirement |
| OpenAI for the agent | Claude tool-use is more reliable for our use case |
| Zapier / Make | Replacing Zoho Flow with another paid SaaS defeats the purpose |
| Redux / MobX | Overkill — Zustand + TanStack Query handles it |
| ESLint + Prettier (separately) | Biome does both, faster |
| Yarn / npm | pnpm is strictly better for monorepos |
