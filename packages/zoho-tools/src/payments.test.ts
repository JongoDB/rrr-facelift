import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import type { ZohoFetchContext } from './fetch.js';
import { recordPayment } from './payments.js';

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

describe('recordPayment', () => {
  it('maps payment_method to Zoho payment_mode label and applies to invoice', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        payment: {
          payment_id: 'p-1',
          customer_id: 'c-1',
          customer_name: 'X',
          amount: 250,
          payment_mode: 'Credit Card',
          date: '2026-05-08',
        },
      });
    }) as unknown as typeof fetch;

    const out = await recordPayment(ctxWith(fetchImpl), {
      customer_id: 'c-1',
      amount: 250,
      payment_method: 'card',
      reference: 'last4-1234',
      invoice_applications: [{ invoice_id: 'i-1', amount: 250 }],
    });
    expect(out.payment_id).toBe('p-1');
    expect(body.payment_mode).toBe('Credit Card');
    expect(body.reference_number).toBe('last4-1234');
    expect(body.amount).toBe(250);
    expect(body.invoices).toEqual([{ invoice_id: 'i-1', amount_applied: 250 }]);
  });

  it('defaults date to today when not provided', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        payment: {
          payment_id: 'p-2',
          customer_id: 'c',
          customer_name: 'X',
          amount: 50,
          payment_mode: 'Cash',
          date: '2026-05-08',
        },
      });
    }) as unknown as typeof fetch;
    await recordPayment(ctxWith(fetchImpl), {
      customer_id: 'c',
      amount: 50,
      payment_method: 'cash',
      invoice_applications: [{ invoice_id: 'i-1', amount: 50 }],
    });
    expect(typeof body.date).toBe('string');
    expect((body.date as string).length).toBe(10);
  });
});
