#!/usr/bin/env node
// One-time exchange of a Zoho self-client authorization code for a refresh
// token. Reads ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REGION from
// apps/api/.env.local and writes ZOHO_REFRESH_TOKEN back into the same file.
//
// Usage: pnpm zoho:mint <auth_code>
//
// The auth code comes from https://api-console.zoho.com → Self Client
// → Generate Code with the scopes listed in planning/06-zoho-integration.md.
// Auth codes expire ~3-10 minutes after creation, so run this immediately.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', 'apps', 'api', '.env.local');

const code = process.argv[2];
if (!code) {
  console.error('Usage: pnpm zoho:mint <auth_code>');
  process.exit(2);
}

const env = await readFile(envPath, 'utf8');
const envGet = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

const clientId = envGet('ZOHO_CLIENT_ID');
const clientSecret = envGet('ZOHO_CLIENT_SECRET');
const region = envGet('ZOHO_REGION') || 'com';

if (!clientId || !clientSecret) {
  console.error(`Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET in ${envPath}`);
  process.exit(2);
}

const tokenUrl = `https://accounts.zoho.${region}/oauth/v2/token`;
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: clientId,
  client_secret: clientSecret,
  code,
});

const res = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const data = await res.json();

if (!res.ok || !data.refresh_token) {
  console.error('Token exchange failed:');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const refreshLine = `ZOHO_REFRESH_TOKEN=${data.refresh_token}`;
const newEnv = /^ZOHO_REFRESH_TOKEN=.*$/m.test(env)
  ? env.replace(/^ZOHO_REFRESH_TOKEN=.*$/m, refreshLine)
  : `${env.trimEnd()}\n${refreshLine}\n`;

await writeFile(envPath, newEnv);

console.info('Refresh token saved to apps/api/.env.local');
console.info(`Granted scopes: ${data.scope}`);
console.info(`Access token expires in: ${data.expires_in}s (cached, reusable until expiry)`);
