import { describe, expect, it, vi } from 'vitest';
import {
  addCustomerComment,
  addInternalComment,
  buildIntakeTemplate,
  listInternalComments,
} from './comments.js';
import type { ZohoConfig } from './config.js';
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

describe('addInternalComment', () => {
  it('POSTs to the right endpoint with show_comment_to_clients=false', async () => {
    let captured: { url: URL | string; body: Record<string, unknown> } = {
      url: '',
      body: {},
    };
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      captured = { url: input, body: JSON.parse(String(init?.body ?? '{}')) };
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        comment: { comment_id: 'cmt-1', description: 'tech note', comment_type: 'internal' },
      });
    }) as unknown as typeof fetch;

    const out = await addInternalComment(ctxWith(fetchImpl), 'estimate', 'e-1', 'tech note');
    expect(out.comment_id).toBe('cmt-1');
    const url = captured.url instanceof URL ? captured.url : new URL(String(captured.url));
    expect(url.pathname).toContain('/estimates/e-1/comments');
    expect(captured.body.description).toBe('tech note');
    expect(captured.body.show_comment_to_clients).toBe(false);
  });

  it('targets the invoices path when documentType=invoice', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.pathname).toContain('/invoices/i-9/comments');
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        comment: { comment_id: 'cmt-2', description: 'x', comment_type: 'internal' },
      });
    }) as unknown as typeof fetch;
    await addInternalComment(ctxWith(fetchImpl), 'invoice', 'i-9', 'x');
  });
});

describe('addCustomerComment', () => {
  it('flags show_comment_to_clients=true', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        comment: { comment_id: 'c', description: 'hi', comment_type: 'customer' },
      });
    }) as unknown as typeof fetch;
    await addCustomerComment(ctxWith(fetchImpl), 'invoice', 'i-1', 'hi');
    expect(body.show_comment_to_clients).toBe(true);
  });
});

describe('listInternalComments', () => {
  it('filters out system / customer types', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        comments: [
          { comment_id: 'a', description: 'created', comment_type: 'system' },
          { comment_id: 'b', description: 'tech note', comment_type: 'internal' },
          { comment_id: 'c', description: 'hi customer', comment_type: 'customer' },
          { comment_id: 'd', description: 'parts list', comment_type: 'internal' },
        ],
      }),
    ) as unknown as typeof fetch;
    const out = await listInternalComments(ctxWith(fetchImpl), 'estimate', 'e-1');
    expect(out.map((c) => c.comment_id)).toEqual(['b', 'd']);
  });
});

describe('buildIntakeTemplate', () => {
  it('matches the Mobile/scheduled shape observed in the audit', () => {
    const text = buildIntakeTemplate({
      service_type: 'ROUTINE MOBILE SERVICE',
      scheduled_for: '04-May-2026 01:00 PM',
      rv: { year: 2017, make: 'Forest River', model: 'Vibe', length_ft: 34 },
      vin: '4X4TVBE20H4109433',
      customer_statement: 'bathroom floor evaluation (soft around toilet due to supply line leak)',
      service_address: '715 Will Black Road, Salisbury, North Carolina 28147',
      gate_code: '',
      parking_instructions: '',
      distance_miles: 12,
      phone: '7045551234',
      email: 'cust@example.com',
    });
    expect(text).toContain('ROUTINE MOBILE SERVICE REQUESTED FOR 04-May-2026 01:00 PM');
    expect(text).toContain('RV Info: 2017 Forest River Vibe, 34 ft');
    expect(text).toContain('VIN: 4X4TVBE20H4109433');
    expect(text).toContain(
      'Customer Statement: bathroom floor evaluation (soft around toilet due to supply line leak)',
    );
    expect(text).toContain('Service Address: 715 Will Black Road, Salisbury, North Carolina 28147');
    expect(text).toContain('Distance: 12 m');
    expect(text).toContain('Phone: 7045551234');
    expect(text).toContain('Email: cust@example.com');
  });

  it('emits VIN: unsure when missing and omits address/distance for on-site', () => {
    const text = buildIntakeTemplate({
      service_type: 'ON-SITE SERVICE',
      rv: { year: 2003, make: 'Newmar', model: 'Mountain Aire', length_ft: 40 },
      customer_statement: 'check the freezer',
    });
    expect(text).toContain('ON-SITE SERVICE REQUESTED');
    expect(text).not.toContain('REQUESTED FOR');
    expect(text).toContain('VIN: unsure');
    expect(text).not.toContain('Service Address');
    expect(text).not.toContain('Distance:');
  });
});
