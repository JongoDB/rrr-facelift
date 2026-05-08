# 12 — Human Actions

> Things ONLY the human owner can do. Claude Code surfaces these in wrap-ups; this doc is the canonical reference.

## Always-On Categories

These are never delegable to Claude Code:

1. **Account creation** — Cloudflare, Zoho, Twilio, Resend, GitHub, etc. (signup forms, emails, payment methods)
2. **Credential generation** — OAuth refresh tokens, API keys, certificates
3. **Payment authorizations** — buying domains, paying for SMS, providing card on file
4. **DNS / domain ownership changes** — nameserver migration, domain registrar logins
5. **UI/UX subjective approval** — copy voice, brand fit, visual feel
6. **Real-world testing** — voice testing on actual devices, field-tech feedback
7. **Production go-lives** — flipping the production DNS, sending real customer emails/SMS
8. **Business decisions** — pricing changes, terms of service, refund policies
9. **Catalog rates and rules** — what to charge for labor, mileage radius if changing, warranty terms

## Per-Phase Human Actions

### Before Phase 00 (kickoff)

- [ ] Decide on GitHub repo location (personal account, new org, or existing org)
- [ ] Provide owner email for repo notifications
- [ ] Confirm VM access details and Docker availability
- [ ] Cloudflare account ready (free tier is fine)

### Phase 00 — Foundation

- [ ] **Create accounts** (if not already): Cloudflare, GitHub, Anthropic Console, Zoho Books (existing), Twilio, Resend
- [ ] **Provide API tokens to Claude Code** (via secure channel — see `planning/13-secrets-manifest.md`):
  - Anthropic API key
  - Cloudflare API token (with Pages, Workers, DNS, Tunnel scopes)
  - GitHub PAT or repo write access for the agent
- [ ] **Confirm shop address** (used for mileage calc origin)
- [ ] **Confirm owner mobile number** (for tech SMS)
- [ ] **Confirm owner email** (for magic link login + alerts)

### Phase 01 — Service Catalog + Zoho Integration

- [ ] **Generate Zoho Books OAuth credentials:**
  1. Go to `https://api-console.zoho.com`
  2. Create "Self Client" (or use existing if you have one)
  3. Note Client ID and Client Secret
  4. Use the "Generate Code" feature with the scopes listed in `planning/06-zoho-integration.md`
  5. Run the script Claude Code provides to exchange the code for a refresh token
  6. Provide refresh token, client ID, client secret to Claude Code
- [ ] **Confirm Zoho Org ID** (visible in Zoho Books URL after login: `https://books.zoho.com/app/<ORG_ID>`)
- [ ] **Decide: real org or sandbox?** If you have a Zoho sandbox, share that org ID instead for safer dev. Otherwise OK to use production with [TEST] tagging.
- [ ] **Confirm catalog rates** — Claude Code will produce a catalog seed file; review and fill in any `TODO_RATE` markers (labor, after-hours, etc.). Confirm tax rate (NC + Rowan County).
- [ ] **Approve seeding the catalog** into your live Zoho Books items list.

### Phase 02 — n8n + Intake Workflow

- [ ] **Cloudflare Tunnel setup (one-time):**
  1. Install `cloudflared` on the VM
  2. Run `cloudflared tunnel login` (browser auth)
  3. Run `cloudflared tunnel create rrr-vm`
  4. In Cloudflare dashboard: configure tunnel hostnames (Claude Code provides the list)
  5. Share the tunnel token with Claude Code
- [ ] **Twilio purchase** — buy a 10DLC-registered phone number ($1-2/mo); Claude Code provides the account SID/auth token format
- [ ] **Twilio A2P 10DLC registration** — required for SMS to US numbers; takes 1-7 days; can run during other phases
- [ ] **Resend domain verification** — add DNS records to verify `triple-r-rv.com` for sending email
- [ ] **Provide owner phone number** for tech alerts (already provided in Phase 00 — confirm)
- [ ] **Test the live flow** — submit a fake intake, confirm SMS arrives + Zoho draft created. Approve to proceed.

### Phase 03 — Website Migration

- [ ] **Review and edit all migrated copy.** Only you know the brand voice. Claude Code provides Markdown files; edit via your editor or via PR review.
- [ ] **Approve final design** — review preview deploy on phone + desktop.
- [ ] **Provide images** if missing — logo (high-res SVG ideal), hero photos of techs/RVs/work, before/after photos for services.
- [ ] **Approve DNS cutover.** This is the production go-live. Claude Code stops at the line "ready to cutover" and waits for your explicit ✅ before changing nameservers.
- [ ] **Cancel Squarespace subscription** after 7 days of new-site stability.

### Phase 04 — Tech PWA: Chat + Tool Use

- [ ] **Install the PWA** on your phone (Add to Home Screen).
- [ ] **Test the actual flow** — log in, search a real customer, create a test estimate, send it to yourself.
- [ ] **Provide UX feedback** in the wrap-up review — what's slow, awkward, confusing.
- [ ] **Approve send-to-customer email/SMS templates** — Claude Code drafts them; you tune the voice.
- [ ] **Confirm authorized tech email list** — initially just yourself; add others as you onboard them.

### Phase 05 — Voice → Line Items

- [ ] **Record real-job voice samples** for testing. Aim for 5-10 dictations of typical work descriptions you'd give your techs (or a tech would give their own log).
- [ ] **Validate catalog mapping** — review Claude Code's extraction against what you would have entered. Flag misses; Claude Code adds keywords or new catalog items as needed (with your approval).
- [ ] **Approve catalog additions** — never auto-added; each new item is proposed in the wrap-up.
- [ ] **Real-world stress test** — use it on an actual job for a week. Note anything weird.

### Phase 06 — Polish & Expansion

- [ ] **Cancel Zoho Flow subscription** once n8n workflows fully replace it (verify in workflow inventory before canceling).
- [ ] **Choose backup destination** (Cloudflare R2, Backblaze B2, etc.) — Claude Code recommends; you approve based on cost.
- [ ] **Decide on optional features:**
  - [ ] Customer status portal? (yes/no/later)
  - [ ] Parts-arrived workflow? (need email parser or manual button — your call)
  - [ ] Calendar integration with Google Workspace? (extra work)
- [ ] **Final sign-off** — declare project complete and stable.

---

## How to Provide Credentials

Don't paste secrets in chat or commit them to repo. Recommended methods:

- **Cloudflare Workers Secrets:** `wrangler secret put SECRET_NAME` from your terminal (Claude Code can't do this — only you can authenticate to your Cloudflare account)
- **n8n credentials:** Add via the n8n UI at `flows.triple-r-rv.com/credentials` after Phase 02
- **`.env.local` files:** for local dev only; gitignored; Claude Code instructs you which file and which keys
- **GitHub Secrets:** for CI/CD; add via repo Settings → Secrets and variables → Actions

If Claude Code needs a value to proceed (not a secret — e.g., your shop address, a chosen username), you can put it in chat directly or in a `local.config.ts` that Claude Code is allowed to read.

## What Claude Code Will NOT Ask You For

- API keys it doesn't strictly need (will work with mocks until you provide real ones)
- Passwords (uses passwordless auth everywhere)
- Money decisions without explaining the cost
- Approval to do irreversible things without naming what they are
