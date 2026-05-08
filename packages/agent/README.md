# @rrr/agent

Anthropic SDK wrapper, prompt templates, and the Claude tool-use loop driver consumed by `apps/api`.

## Why a separate package

Per planning/03-tech-stack.md: keeping the SDK call pattern (`messages.create` with `tools`) encapsulated here makes the model layer **swappable** without touching every workflow.

## Phase 00 status

Stub only — type contracts and a tiny prompt registry. The Anthropic SDK dependency, the tool-use loop driver, prompt templates for the intake classifier (Haiku) and tech-PWA chat (Sonnet), and audio-to-line-item flows land in Phase 02 (intake) and Phase 04/05 (tech PWA).

## Configuration

See `.env.example`.
