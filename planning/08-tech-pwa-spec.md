# 08 — Tech PWA Specification

> The phone-installable app techs use in the field. Voice-first ergonomics, but works fine without voice. Authenticated, edge-served, conversational.

## Surface

- URL: `app.triple-r-rv.com`
- Hosted on Cloudflare Pages (frontend) + Cloudflare Worker for API (`api.triple-r-rv.com`)
- Installable PWA: home-screen icon, splash, fullscreen mode
- Targets: iOS Safari, Chrome on Android (primary). Desktop Chrome/Safari work, are not optimized.

## User Roles

- **Owner** — sees everything, can manage techs
- **Tech** — sees own jobs, can act on any customer/job
- **(future) Bookkeeper** — read-only financial views (out of MVP scope)

Initial implementation supports a single `owner` role and a simple list of authorized email addresses; multi-role enforcement deferred until needed.

## Auth Flow

1. Tech visits `app.triple-r-rv.com` → redirected to `/login` if no session
2. `/login` shows email field; submit triggers Worker `/auth/magic-link`
3. Worker checks email is in authorized list, issues signed token, sends Resend email with link `app.triple-r-rv.com/auth/verify?token=<jwt>`
4. Verify endpoint sets httpOnly cookie with 7-day rolling JWT, redirects to home
5. All API requests include cookie; Worker validates JWT before any Zoho/Anthropic call

**No passwords. No password reset.** Authorized email list managed in Worker env or Postgres `users` table (Phase 04 decision).

## Information Architecture

### `/` — Home
- Top: "Quick action" buttons: **🎤 Voice**, **💬 Chat**, **➕ New Estimate**, **➕ New Invoice**
- List: recent jobs (last 7 days), tappable to drill into details
- Search: customer name / phone autocomplete (uses cached items + cached contacts)

### `/chat` — Chat Mode
- Message list (user + assistant + tool-call cards)
- Input at bottom: text field + mic button
- Tool calls render as collapsed cards with expand to see details (e.g., "Looked up John Smith — 3 prior jobs")
- Streaming responses (SSE from Worker)
- Persistent thread per session (until tech taps "new conversation")

### `/voice` — Voice Mode
- Big mic button center screen (Phase 05)
- States: idle → recording (waveform animation) → uploading → transcribing → reasoning → review
- Transcript shown above suggested line items
- Suggested items as editable cards: name, qty (stepper), rate (editable), description, ✕ remove
- "Add line" button for manual additions
- Bottom: "Save as Draft Estimate" / "Save as Draft Invoice" / "Discard"

### `/customers` — Customer List
- Search/filter by name, phone, last activity
- Tap to view detail page

### `/customers/:id`
- Header: name, phone, email, address (with map link)
- Tabs: **Estimates** | **Invoices** | **Jobs** | **Notes**
- "New Estimate" / "New Invoice" buttons — pre-fill customer

### `/jobs/:estimate_id` or `/jobs/:invoice_id`
- Document preview (line items, totals)
- Actions: Edit, Send to customer, Convert to invoice (if estimate), Record payment (if invoice), Mark complete

### `/settings`
- User profile, sign out
- Catalog browser (read-only) — useful when tech needs to find an item by browsing
- Audit log (last 50 tool calls — for debugging)

## Component Design Notes

- **One-handed operation.** Critical actions are reachable with thumb in lower 2/3 of screen.
- **Big tap targets.** Min 44pt iOS / 48dp Android.
- **Loading states are explicit.** Never a blank screen. Skeleton screens for lists; spinners with labels for AI calls ("Thinking...", "Looking up customer...").
- **Errors are recoverable.** Network drops are common in the field. Mutations queue locally and retry on reconnect (TanStack Query handles this).
- **Offline read.** Cached data (catalog, recent customers) viewable offline. Mutations require online.

## Voice UX (Phase 05)

The interaction:

1. Tech taps mic
2. **Recording state** — waveform visualization, "Stop" button, max 3-min recording
3. Tech taps Stop (or auto-stop on 3 min)
4. **Upload state** — "Sending audio..." (progress bar)
5. **Transcribe state** — "Listening..." (transcript streams in if Speaches supports SSE)
6. **Reasoning state** — "Building line items..."
7. **Review state** — transcript at top, line item cards below

Latency budgets (3-min audio max):
- Upload: <2s on LTE
- Transcription: <5s on GPU, <15s on CPU
- Claude tool-use loop: <5s typical, <10s p95
- Total: <12s on GPU stack, <25s on CPU stack

If any stage exceeds budget by 2x, log and surface to owner via wrap-up.

### Voice Prompt Template

The system prompt prepended to the transcript when calling Claude:

```
You are processing a verbal description from an RRR Custom RV Services technician. The transcript below describes work performed (for an invoice) or work to be done (for an estimate). Extract specific line items mapping to the catalog using the search_items tool. Be liberal with searches — try multiple keyword variations.

Critical:
- Always confirm ambiguous items with the tech (return a question instead of guessing).
- Default labor unit is hours; convert minutes to fractional hours (e.g., "30 min" → 0.5).
- Common parts mentions: Dicor (lap sealant, sold by tube), butyl (tape, by linear ft), gaskets (each).
- If transcript mentions mileage or trip fees, ignore them — those are auto-calculated.
- 1-hour labor minimum is enforced server-side; don't worry about it.

Today: {DATE}
Tech: {TECH_NAME}
Mode: {ESTIMATE|INVOICE}
Customer (if pre-selected): {CUSTOMER_NAME or "not yet selected"}

Transcript:
"""
{TRANSCRIPT}
"""
```

The model is expected to call `search_items` 1-N times, then return a structured proposal as a final tool call (`propose_line_items`) that the PWA renders.

## API Surface (Worker → PWA)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/magic-link` | POST | Issue + email magic link |
| `/auth/verify` | GET | Verify token, set cookie, redirect |
| `/auth/me` | GET | Return current user info |
| `/auth/logout` | POST | Clear cookie |
| `/agent/chat` | POST | Streaming chat with tool use |
| `/agent/voice` | POST | Voice flow: receives audio (or uses transcript), returns proposal |
| `/zoho/*` | various | Direct Zoho operations (used by both PWA and n8n) |
| `/customers/search` | GET | Customer autocomplete (Postgres cache + Zoho fallback) |
| `/items/search` | GET | Item catalog autocomplete |
| `/jobs/recent` | GET | Recent estimates + invoices for the logged-in user |

All routes (except `/auth/*`) require valid JWT cookie.

## Performance & Bundle Size

- Target initial JS payload: <150KB gzipped
- Lighthouse perf score: ≥90 on mobile
- First contentful paint: <1.5s on Slow 3G
- Use route-based code splitting (Vite default)
- Preload customer + item caches on home page so chat/voice flows feel instant

## Testing

- **Unit:** Vitest for all hooks, utility functions, prompt builders
- **Component:** Vitest + React Testing Library for critical components (chat, voice review)
- **E2E:** Playwright for: login → search customer → create estimate → send. Voice E2E uses pre-recorded audio fixtures piped through the real Speaches.
- **Visual regression:** optional, deferred to Phase 06

## Accessibility

- Semantic HTML, proper landmark roles
- All interactive elements keyboard-accessible
- Sufficient color contrast (WCAG AA)
- Screen reader announcements for state changes (recording, processing, success)
- Voice mode does not block manual entry — text alternative always available

## Push Notifications (Future)

Web Push API support varies on iOS (only since iOS 16.4 PWA on home screen). Defer to Phase 06+; early implementation: SMS notifications via n8n cover the high-priority "new intake" alert.

## Why a PWA, Not a Native App

- No app store review, no ~$100/yr Apple cert, no separate codebases
- Auto-updates on every page load
- Web Audio API for voice is reliable on iOS 17+ and modern Android
- For a small tech crew, the install friction is one tap "Add to Home Screen"
- If voice quality or notification reliability becomes a hard limit, revisit Capacitor wrapper as Phase 06+ work
