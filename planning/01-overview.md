# 01 — Project Overview

## Business

**RRR Custom RV Services** (a.k.a. Triple R RV) is a mobile + shop RV repair business in Salisbury, NC. ~25 years experience. Services include: water damage repair, roof reseal, winterization, base plate / braking / light kit installs (towing prep), plumbing, electrical, mechanical diagnostic, AC/furnace, RV inspections, remodeling.

**Pricing structure (already codified):**
- $99 trip fee within 10 mi, $2.70/mi after
- 1-hour labor minimum
- Mobile bookings 3+ days out unless emergency rate
- Standard 1- or 2-year warranties depending on service

**Current stack:** Squarespace (website), Zoho Books (invoices/quotes/customers/items), Zoho Flow ($30/mo, target for replacement), Google Workspace (email).

## Vision

A unified, mostly-self-hosted automation platform that:
1. **Captures customer intake** via a smart branching form on the website with mobile vs on-site routing, photo upload, and instant tech notification.
2. **Pre-classifies jobs** with AI so techs open partially-filled draft estimates instead of blank forms.
3. **Empowers techs in the field** with a phone-installable PWA where they can speak naturally — *"resealed front cap, two and a half hours, used a tube and a half of Dicor, replaced two vent gaskets"* — and have it become a Zoho Books estimate or invoice with the right line items, parts, and labor.
4. **Replaces Zoho Flow** with self-hosted n8n.
5. **Runs free** wherever possible — Cloudflare free tier, owner's existing VM/containers, open-source software. Anthropic API spend allowed only for the user-facing conversational layer.

## Success Criteria

The project is "done" when:

1. ✅ Customer fills out intake form on `triple-r-rv.com` → owner/tech receives SMS within 60s with AI summary + classification → draft contact + job created in Zoho Books → mileage auto-calculated for mobile.
2. ✅ Tech opens PWA on phone, speaks a service description, reviews the AI-extracted line items, taps "Create Estimate" → estimate exists in Zoho Books and is sent to customer via email/SMS.
3. ✅ Same flow works for "Create Invoice" after work is complete.
4. ✅ Website is hosted on Cloudflare Pages, costs $0/month, is editable via git commits, and renders correctly on mobile + desktop.
5. ✅ n8n is running on the owner's infrastructure behind Cloudflare Tunnel, replacing all current Zoho Flow workflows.
6. ✅ Squarespace and Zoho Flow subscriptions can be canceled.
7. ✅ Documentation is sufficient that the owner could hand the codebase to another contractor without knowledge transfer sessions.

## Non-Goals

Explicitly out of scope to prevent feature creep:

- **Replacing Zoho Books.** It stays as the system of record. We integrate, we don't replicate.
- **Customer-facing portal in Phase 1-5.** Customers communicate via SMS, email, and the existing Zoho-generated PDFs. Portal is Phase 06 if pursued.
- **Multi-tenant / multi-shop support.** Single-business build. Don't over-engineer for tenants.
- **Native mobile app.** PWA only. App stores add friction without value at this scale.
- **Replacing email.** Google Workspace stays.
- **Inventory management beyond Zoho Books items.** Don't build a separate parts inventory system.

## Owner Profile

- Technical enough to host containers and read code, but is the only operator running the business — time is the scarcest resource.
- Wants Claude Code to drive the SDLC autonomously and only escalate for credentials, UI/UX feedback, business decisions, and approvals (DNS cutover, production OAuth).
- Reads wrap-up files between sessions; does not want chat-by-chat oversight.

## Service Area Context

Salisbury, NC (35.6711° N, 80.4748° W). Mobile service radius covers Rowan County and surrounding (Cabarrus, Davidson, Iredell, Davie). Mileage calculation must use the shop address as origin — encode it as a config constant.
