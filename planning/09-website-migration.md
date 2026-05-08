# 09 — Website Migration: Squarespace → Astro / Cloudflare Pages

## Goal

Replace Squarespace with `apps/web/` Astro site deployed to Cloudflare Pages. Same domain (`triple-r-rv.com`), same content (improved), zero ongoing hosting cost.

## Pre-Migration Snapshot

**Why:** Squarespace blocks bots (we hit 403s). We need raw content + visual reference for the rebuild.

**Tool:** `scripts/snapshot-squarespace.mjs` — Playwright-based.

```javascript
// Pseudocode — Claude Code implements per planning/03-tech-stack.md conventions
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';

const PAGES = ['/', '/services', '/pricing', '/discounts', '/about', '/contact'];

async function snapshot() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
               'AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await ctx.newPage();
  await mkdir('snapshots/desktop', { recursive: true });
  await mkdir('snapshots/mobile', { recursive: true });
  await mkdir('snapshots/content', { recursive: true });

  for (const path of PAGES) {
    await page.goto(`https://www.triple-r-rv.com${path}`, { waitUntil: 'networkidle' });
    const slug = path === '/' ? 'home' : path.slice(1);
    await page.screenshot({ path: `snapshots/desktop/${slug}.png`, fullPage: true });
    await writeFile(`snapshots/content/${slug}.md`, await page.evaluate(() => document.body.innerText));
    await writeFile(`snapshots/content/${slug}.html`, await page.content());
  }

  // Mobile viewport screenshots
  await ctx.close();
  // ... iPhone 12 viewport, repeat
  await browser.close();
}
```

Output committed to `snapshots/` (gitignored binary content; structure committed via README).

## Astro Project Structure

```
apps/web/
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Layout.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── ServiceCard.astro
│   │   ├── PricingTable.astro
│   │   └── IntakeForm.tsx        ← React island, the only JS-heavy component
│   ├── content/
│   │   ├── config.ts             ← Astro Content Collections schema
│   │   ├── services/
│   │   │   ├── roof-reseal.md
│   │   │   ├── base-plate.md
│   │   │   └── ...
│   │   └── pages/
│   │       ├── about.md
│   │       ├── pricing.md
│   │       └── discounts.md
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── services/index.astro
│   │   ├── services/[slug].astro
│   │   ├── pricing.astro
│   │   ├── about.astro
│   │   ├── discounts.astro
│   │   ├── contact.astro
│   │   ├── intake.astro
│   │   └── 404.astro
│   └── styles/
│       └── global.css
└── tsconfig.json
```

## Content Strategy

- All page content lives as Markdown in `src/content/`
- Schema enforced via Astro Content Collections (`src/content/config.ts`)
- Owner edits content by editing markdown files (or via PR review if non-technical edits)
- Service descriptions can be templated from the service catalog: services listed on `/services` are pulled from `packages/service-catalog` so a catalog change auto-updates the public site

## Intake Form (`/intake`)

**Component:** `src/components/IntakeForm.tsx` (React island, hydrated client-side)

**Flow (branching):**

1. **Step 1 — Service location**
   - "Where do you need service?"
   - Two big buttons: **Mobile (we come to you)** / **Bring it to the shop**
   - Sets `service_type` and routes subsequent steps

2. **Step 2 — RV details (both paths)**
   - Year, Make, Model (free text or dropdown if owner provides preferred values), Length (optional)

3. **Step 3 — Problem description (both paths)**
   - Multi-line text area
   - Photo upload (multi-file, drag-drop, max 5 photos, 10MB each)
   - Files upload to Cloudflare R2 (free tier) via signed upload URL from Worker — keeps R2 keys server-side

4. **Step 4a (mobile) — Address + scheduling**
   - Full address (street, city, state, zip)
   - Auto-validates and shows estimated trip fee live (calls `api.triple-r-rv.com/agent/calculate-mileage`)
   - "Is this an emergency?" → if yes, surface emergency rate disclaimer
   - Preferred date window (next 2 weeks, with weekends/holidays grayed out per shop config)

5. **Step 4b (shop) — Drop-off scheduling**
   - Preferred drop-off date
   - Brief drop-off instructions

6. **Step 5 — Contact info**
   - First/last name, phone, email
   - SMS consent checkbox (required for tech-update SMS)
   - "By submitting, you agree to our service terms" (link to terms — owner provides or generic version)

7. **Step 6 — Submit**
   - Summary of everything entered
   - Submit button → `POST flows.triple-r-rv.com/webhook/intake`
   - Success: thank-you message + "we'll text/email you within 24 hours"

**Validation:** zod schema shared with the Worker; validates client-side before submit and server-side on receipt.

## Deployment

### Cloudflare Pages

- Project: `rrr-web` (matches `apps/web/`)
- Build command: `pnpm --filter web build`
- Build output: `apps/web/dist/`
- Production branch: `main`
- Preview deploys: every other branch gets a preview URL
- Custom domain: `triple-r-rv.com` (apex) and `www.triple-r-rv.com` (redirect to apex)

### Build Configuration

- Astro outputs static HTML by default — perfect for Pages
- The intake form's React island includes only the form code, not full React app
- Image optimization via Astro's built-in image service
- Bundle size target: <100KB JS for the entire site (intake form is the only JS island)

## DNS Cutover Plan

This is the production go-live moment. **Requires explicit human approval before executing.**

1. **Pre-flight (2-3 days before):**
   - Verify Pages preview deploy renders correctly on all major browsers
   - Owner reviews and approves all content
   - Verify intake form submits successfully against production n8n webhook
   - Set TTL on existing Squarespace DNS records to 5 minutes (so cutover is fast)

2. **Cutover steps:**
   - Confirm with owner: "Going live now, ETA 15-30 min."
   - In Cloudflare: add `triple-r-rv.com` to the rrr-web Pages project as custom domain
   - At domain registrar: change nameservers to Cloudflare's (or update A/CNAME if keeping registrar's NS)
   - Wait for DNS propagation (5-30 min depending on TTL, usually fast on modern resolvers)
   - Verify with `dig` from multiple resolvers
   - Browse site, submit a test intake form, confirm SMS arrives

3. **Post-cutover:**
   - Monitor for 24h
   - If anything breaks: revert nameservers to Squarespace as emergency rollback
   - After 7 days of stability: cancel Squarespace subscription

## SEO Migration

- 301 redirects from old Squarespace URLs to new equivalents (most likely identical paths, but verify)
- Submit new sitemap to Google Search Console after cutover
- Maintain existing meta titles/descriptions where present in snapshot
- Add `OrganizationType` JSON-LD with business name, hours, address, phone, services offered (better local SEO)
- Verify Google Business Profile still points to correct URL

## What We're NOT Migrating

- Squarespace's built-in form — replaced with our intake flow
- Squarespace blog (if any) — owner's call; if blog content exists, migrate as Astro Content Collection
- Squarespace e-commerce — RRR doesn't have any
- Any third-party Squarespace integrations (chat widget, analytics) — replaced with: Cloudflare Web Analytics (free, privacy-friendly), no chat widget by default
