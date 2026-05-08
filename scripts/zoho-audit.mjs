#!/usr/bin/env node
// Read-only audit of the RRR Zoho Books org. Mints an access token from the
// stored refresh token, queries every reference endpoint we care about, saves
// the raw JSON to audit/zoho/ (gitignored — contains customer PII), and
// prints a coverage summary.
//
// Usage: pnpm zoho:audit
//
// Zero writes. Safe to run any time.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', 'apps', 'api', '.env.local');
const auditDir = resolve(__dirname, '..', 'audit', 'zoho');
await mkdir(auditDir, { recursive: true });

const env = await readFile(envPath, 'utf8');
const envGet = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

const cfg = {
  clientId: envGet('ZOHO_CLIENT_ID'),
  clientSecret: envGet('ZOHO_CLIENT_SECRET'),
  refreshToken: envGet('ZOHO_REFRESH_TOKEN'),
  orgId: envGet('ZOHO_ORG_ID'),
  region: envGet('ZOHO_REGION') || 'com',
};

for (const [k, v] of Object.entries(cfg)) {
  if (!v) {
    console.error(`Missing ${k} in ${envPath}`);
    process.exit(2);
  }
}

const tokenUrl = `https://accounts.zoho.${cfg.region}/oauth/v2/token`;
const baseUrl = `https://www.zohoapis.${cfg.region}/books/v3`;

async function mintAccessToken() {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`mint failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

const accessToken = await mintAccessToken();
console.info('Access token minted.');

async function apiGet(path, query = {}) {
  const url = new URL(baseUrl + path);
  url.searchParams.set('organization_id', cfg.orgId);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { non_json_body: text.slice(0, 1000) };
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function apiGetAll(path, listKey, baseQuery = {}) {
  const all = [];
  let page = 1;
  while (true) {
    const data = await apiGet(path, { ...baseQuery, page, per_page: 200 });
    const list = Array.isArray(data[listKey]) ? data[listKey] : [];
    all.push(...list);
    const ctx = data.page_context;
    if (!ctx?.has_more_page) break;
    page += 1;
    if (page > 100) break;
  }
  return all;
}

async function save(name, data) {
  const path = resolve(auditDir, `${name}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  return path;
}

const results = {};

async function safe(name, fn) {
  try {
    const data = await fn();
    await save(name, data);
    results[name] = { ok: true, count: Array.isArray(data) ? data.length : null };
  } catch (e) {
    results[name] = { ok: false, status: e.status, error: e.message.slice(0, 200) };
    console.warn(`  ${name} failed: ${e.message.slice(0, 200)}`);
  }
}

console.info('\n── Org / settings ──');
await safe('organizations', () => apiGet('/organizations'));
await safe('settings-taxes', () => apiGet('/settings/taxes'));
await safe('settings-currencies', () => apiGet('/settings/currencies'));
await safe('settings-preferences', () => apiGet('/settings/preferences'));

for (const entity of ['contacts', 'items', 'estimates', 'invoices', 'salesorders']) {
  await safe(`settings-customfields-${entity}`, () =>
    apiGet('/settings/preferences/customfields', { entity }),
  );
}

console.info('\n── Items ──');
const itemsList = await apiGetAll('/items', 'items').catch((e) => {
  console.warn(`  items list failed: ${e.message}`);
  return [];
});
await save('items', itemsList);
results.items = { ok: true, count: itemsList.length };

await safe('itemcategories', () => apiGet('/itemcategories'));
await safe('itemgroups', () => apiGet('/itemgroups'));

const itemSamples = itemsList.slice(0, 5);
for (let i = 0; i < itemSamples.length; i++) {
  await safe(`item-detail-${i}`, () => apiGet(`/items/${itemSamples[i].item_id}`));
}

console.info('\n── Contacts ──');
const contactsList = await apiGetAll('/contacts', 'contacts').catch((e) => {
  console.warn(`  contacts list failed: ${e.message}`);
  return [];
});
await save('contacts', contactsList);
results.contacts = { ok: true, count: contactsList.length };

const contactSamples = contactsList.slice(0, 5);
for (let i = 0; i < contactSamples.length; i++) {
  await safe(`contact-detail-${i}`, () => apiGet(`/contacts/${contactSamples[i].contact_id}`));
}

console.info('\n── Estimates ──');
const estimatesList = await apiGetAll('/estimates', 'estimates', {
  sort_column: 'created_time',
  sort_order: 'D',
}).catch((e) => {
  console.warn(`  estimates list failed: ${e.message}`);
  return [];
});
await save('estimates', estimatesList);
results.estimates = { ok: true, count: estimatesList.length };

const estimateSamples = estimatesList.slice(0, 8);
for (let i = 0; i < estimateSamples.length; i++) {
  await safe(`estimate-detail-${i}`, () => apiGet(`/estimates/${estimateSamples[i].estimate_id}`));
  await safe(`estimate-comments-${i}`, () =>
    apiGet(`/estimates/${estimateSamples[i].estimate_id}/comments`),
  );
}

console.info('\n── Invoices ──');
const invoicesList = await apiGetAll('/invoices', 'invoices', {
  sort_column: 'created_time',
  sort_order: 'D',
}).catch((e) => {
  console.warn(`  invoices list failed: ${e.message}`);
  return [];
});
await save('invoices', invoicesList);
results.invoices = { ok: true, count: invoicesList.length };

const invoiceSamples = invoicesList.slice(0, 8);
for (let i = 0; i < invoiceSamples.length; i++) {
  await safe(`invoice-detail-${i}`, () => apiGet(`/invoices/${invoiceSamples[i].invoice_id}`));
  await safe(`invoice-comments-${i}`, () =>
    apiGet(`/invoices/${invoiceSamples[i].invoice_id}/comments`),
  );
}

console.info('\n── Sales orders ──');
const salesOrdersList = await apiGetAll('/salesorders', 'salesorders').catch(() => []);
await save('salesorders', salesOrdersList);
results.salesorders = { ok: true, count: salesOrdersList.length };

await save('_results', results);

console.info('\n════ Coverage summary ════');
for (const [name, r] of Object.entries(results)) {
  const status = r.ok ? '✓' : `✗ ${r.status ?? ''}`;
  const detail = r.ok && r.count !== null ? `(${r.count})` : (r.error ?? '');
  console.info(`  ${status.padEnd(6)} ${name.padEnd(36)} ${detail}`);
}
console.info(`\nRaw outputs: ${auditDir}`);
console.info('Note: this directory is gitignored (contains customer PII).');
