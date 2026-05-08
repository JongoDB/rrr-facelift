import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import type { ZohoFetchContext } from './fetch.js';
import { convertEstimateToInvoice, createInvoice, getInvoice } from './invoices.js';
import { INVOICE_NOTES_TEXT, INVOICE_TERMS_TEXT } from './templates.js';

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

describe('createInvoice', () => {
  it('defaults to Due-on-Receipt + verbatim warranty + verbatim invoice terms', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        invoice: {
          invoice_id: 'i-1',
          invoice_number: 'INV-1',
          customer_id: 'c',
          customer_name: 'X',
          status: 'draft',
          date: '2026-05-08',
          payment_terms: 0,
          payment_terms_label: 'Due on Receipt',
          total: 100,
          sub_total: 100,
          tax_total: 0,
          balance: 100,
          line_items: [],
        },
      });
    }) as unknown as typeof fetch;
    await createInvoice(ctxWith(fetchImpl), {
      customer_id: 'c',
      line_items: [{ item_id: 'i', quantity: 1 }],
    });
    expect(body.payment_terms).toBe(0);
    expect(body.payment_terms_label).toBe('Due on Receipt');
    expect(body.notes).toBe(INVOICE_NOTES_TEXT);
    expect(body.terms).toBe(INVOICE_TERMS_TEXT);
  });
});

describe('convertEstimateToInvoice', () => {
  it('POSTs to /estimates/:id/convert and returns the invoice', async () => {
    let url: URL | string = '';
    let method: string | undefined;
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      url = input;
      method = init?.method;
      return jsonRes(200, {
        code: 0,
        message: 'ok',
        invoice: {
          invoice_id: 'i-9',
          invoice_number: 'INV-9',
          customer_id: 'c',
          customer_name: 'X',
          status: 'sent',
          date: '2026-05-08',
          payment_terms: 0,
          payment_terms_label: 'Due on Receipt',
          total: 100,
          sub_total: 100,
          tax_total: 0,
          balance: 100,
          line_items: [],
        },
      });
    }) as unknown as typeof fetch;

    const out = await convertEstimateToInvoice(ctxWith(fetchImpl), 'e-7');
    const finalUrl = typeof url === 'string' ? new URL(url) : url;
    expect(finalUrl.pathname).toContain('/estimates/e-7/convert');
    expect(method).toBe('POST');
    expect(out.invoice_number).toBe('INV-9');
  });
});

describe('getInvoice', () => {
  it('returns the invoice body from the detail endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        invoice: {
          invoice_id: 'i-1',
          invoice_number: 'INV-1',
          customer_id: 'c',
          customer_name: 'Y',
          status: 'paid',
          date: '2026-05-08',
          payment_terms: 0,
          payment_terms_label: 'Due on Receipt',
          total: 100,
          sub_total: 100,
          tax_total: 0,
          balance: 0,
          line_items: [],
        },
      }),
    ) as unknown as typeof fetch;
    const out = await getInvoice(ctxWith(fetchImpl), 'i-1');
    expect(out.invoice_number).toBe('INV-1');
  });
});
