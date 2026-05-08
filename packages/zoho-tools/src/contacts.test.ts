import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import { createContact, getContactHistory, searchContacts } from './contacts.js';
import type { ZohoFetchContext } from './fetch.js';

const cfg: ZohoConfig = {
  refreshToken: 'rt',
  clientId: 'cid',
  clientSecret: 'cs',
  orgId: 'org-1',
  region: 'com',
};

function ctxWith(fetchImpl: typeof fetch): ZohoFetchContext {
  return { config: cfg, getAccessToken: async () => 'at', fetchImpl };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('searchContacts', () => {
  it('defaults to last_modified_time DESC ranking', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.searchParams.get('sort_column')).toBe('last_modified_time');
      expect(url.searchParams.get('sort_order')).toBe('D');
      expect(url.searchParams.get('per_page')).toBe('25');
      return jsonRes(200, { code: 0, message: 'ok', contacts: [] });
    }) as unknown as typeof fetch;
    await searchContacts(ctxWith(fetchImpl), { search_text: 'smith' });
  });

  it('forwards the search_text query', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.searchParams.get('search_text')).toBe('704-555-0142');
      return jsonRes(200, { code: 0, message: 'ok', contacts: [] });
    }) as unknown as typeof fetch;
    await searchContacts(ctxWith(fetchImpl), { search_text: '704-555-0142' });
  });
});

describe('createContact', () => {
  it('builds the canonical individual-customer payload with RV notes', async () => {
    let captured: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'created',
        contact: { contact_id: 'c-1', contact_name: 'John Smith', contact_type: 'customer' },
      });
    }) as unknown as typeof fetch;
    const created = await createContact(ctxWith(fetchImpl), {
      first_name: 'John',
      last_name: 'Smith',
      email: 'j@example.com',
      mobile: '7045550142',
      notes: '2017 Forest River Vibe, 34 ft',
    });
    expect(created.contact_id).toBe('c-1');
    expect(captured.contact_name).toBe('John Smith');
    expect(captured.contact_type).toBe('customer');
    expect(captured.customer_sub_type).toBe('individual');
    expect(captured.payment_terms).toBe(0);
    expect(captured.payment_terms_label).toBe('Due on Receipt');
    expect(captured.is_sms_enabled).toBe(true);
    expect(captured.notes).toBe('2017 Forest River Vibe, 34 ft');
  });

  it('honours an explicit is_sms_enabled=false', async () => {
    let captured: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'created',
        contact: { contact_id: 'c-2', contact_name: 'A B', contact_type: 'customer' },
      });
    }) as unknown as typeof fetch;
    await createContact(ctxWith(fetchImpl), {
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.test',
      mobile: '7045550000',
      is_sms_enabled: false,
    });
    expect(captured.is_sms_enabled).toBe(false);
  });
});

describe('getContactHistory', () => {
  it('merges invoices+estimates and returns most-recent-first up to limit', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/invoices')) {
        return jsonRes(200, {
          invoices: [
            {
              invoice_id: 'i-1',
              invoice_number: 'INV-1',
              status: 'paid',
              total: 200,
              date: '2026-04-01',
            },
            {
              invoice_id: 'i-2',
              invoice_number: 'INV-2',
              status: 'paid',
              total: 100,
              date: '2026-03-01',
            },
          ],
        });
      }
      if (url.pathname.endsWith('/estimates')) {
        return jsonRes(200, {
          estimates: [
            {
              estimate_id: 'e-1',
              estimate_number: 'QT-1',
              status: 'sent',
              total: 500,
              date: '2026-05-01',
            },
          ],
        });
      }
      return jsonRes(404, {});
    }) as unknown as typeof fetch;

    const out = await getContactHistory(ctxWith(fetchImpl), 'c-1', 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.document_type).toBe('estimate');
    expect(out[0]?.date).toBe('2026-05-01');
    expect(out[1]?.document_type).toBe('invoice');
    expect(out[1]?.date).toBe('2026-04-01');
  });
});
