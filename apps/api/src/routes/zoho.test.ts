import type { ZohoClient, ZohoItem } from '@rrr/zoho-tools';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { buildZohoRouter } from './zoho.js';

// Just enough of Env to satisfy buildZohoClient's required check (we override
// the factory anyway; this is only to make the Hono context happy).
const env: Env = {
  ZOHO_REFRESH_TOKEN: 'rt',
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'cs',
  ZOHO_ORG_ID: 'org-1',
  ZOHO_REGION: 'com',
};

function stubClient(overrides: Partial<ZohoClient> = {}): ZohoClient {
  // Most tests only touch one or two methods. Unused ones throw so a typo
  // surfaces immediately as a test failure instead of silently passing.
  const noop = (name: string) =>
    vi.fn(async () => {
      throw new Error(`stubClient: ${name} not configured for this test`);
    });
  return {
    fetch: noop('fetch'),
    getAccessToken: vi.fn(async () => 'at'),
    listItems: noop('listItems'),
    listAllItems: noop('listAllItems'),
    searchContacts: noop('searchContacts'),
    getContact: noop('getContact'),
    createContact: noop('createContact'),
    getContactHistory: noop('getContactHistory'),
    createEstimate: noop('createEstimate'),
    getEstimate: noop('getEstimate'),
    addLinesToEstimate: noop('addLinesToEstimate'),
    createInvoice: noop('createInvoice'),
    getInvoice: noop('getInvoice'),
    convertEstimateToInvoice: noop('convertEstimateToInvoice'),
    listComments: noop('listComments'),
    listInternalComments: noop('listInternalComments'),
    addInternalComment: noop('addInternalComment'),
    addCustomerComment: noop('addCustomerComment'),
    recordPayment: noop('recordPayment'),
    ...overrides,
  } as ZohoClient;
}

async function call(
  app: ReturnType<typeof buildZohoRouter>,
  path: string,
  init: RequestInit & { searchParams?: Record<string, string> } = {},
): Promise<Response> {
  const url = new URL(`http://x${path}`);
  for (const [k, v] of Object.entries(init.searchParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return app.fetch(new Request(url, init), env);
}

describe('POST /zoho/upsert-contact', () => {
  it('returns the existing contact when search by mobile hits', async () => {
    const search = vi.fn(async () => ({
      code: 0,
      message: 'ok',
      contacts: [
        {
          contact_id: 'c-1',
          contact_name: 'A B',
          contact_type: 'customer' as const,
          customer_sub_type: 'individual' as const,
        },
      ],
    }));
    const client = stubClient({ searchContacts: search });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/upsert-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.test',
        mobile: '(704) 555-0142',
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { created: boolean; contact: { contact_id: string } };
    expect(data.created).toBe(false);
    expect(data.contact.contact_id).toBe('c-1');
    // Mobile should have been digit-normalized before search.
    expect(search).toHaveBeenCalledWith({ search_text: '7045550142' });
  });

  it('falls back to email search when mobile returns no match', async () => {
    let calls = 0;
    const search = vi.fn(async () => {
      calls++;
      if (calls === 1) return { code: 0, message: 'ok', contacts: [] };
      return {
        code: 0,
        message: 'ok',
        contacts: [
          {
            contact_id: 'c-2',
            contact_name: 'A B',
            contact_type: 'customer' as const,
            customer_sub_type: 'individual' as const,
            email: 'a@b.test',
          },
        ],
      };
    });
    const client = stubClient({ searchContacts: search });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/upsert-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.test',
        mobile: '7045550142',
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { created: boolean };
    expect(data.created).toBe(false);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('creates a new contact when neither lookup hits', async () => {
    const search = vi.fn(async () => ({ code: 0, message: 'ok', contacts: [] }));
    const create = vi.fn(async () => ({
      contact_id: 'c-new',
      contact_name: 'A B',
      contact_type: 'customer' as const,
      customer_sub_type: 'individual' as const,
    }));
    const client = stubClient({ searchContacts: search, createContact: create });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/upsert-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.test',
        mobile: '7045550142',
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { created: boolean; contact: { contact_id: string } };
    expect(data.created).toBe(true);
    expect(data.contact.contact_id).toBe('c-new');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 with details on validation failure', async () => {
    const app = buildZohoRouter(() => stubClient());
    const res = await call(app, '/upsert-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: 'X' }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; details: unknown };
    expect(data.error).toBe('Validation failed');
    expect(data.details).toBeDefined();
  });
});

describe('POST /zoho/create-estimate', () => {
  it('forwards to ZohoClient.createEstimate and returns 201 with the estimate', async () => {
    const create = vi.fn(async () => ({
      estimate_id: 'e-1',
      estimate_number: 'QT-001',
      customer_id: 'c-1',
      customer_name: 'X',
      status: 'draft',
      date: '2026-05-08',
      total: 0,
      sub_total: 0,
      tax_total: 0,
      line_items: [],
    }));
    const client = stubClient({ createEstimate: create });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/create-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: 'c-1',
        line_items: [{ item_id: 'i', quantity: 1 }],
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { estimate: { estimate_id: string } };
    expect(data.estimate.estimate_id).toBe('e-1');
    expect(create).toHaveBeenCalledWith({
      customer_id: 'c-1',
      line_items: [{ item_id: 'i', quantity: 1 }],
    });
  });
});

describe('POST /zoho/post-intake-template', () => {
  it('builds the verbatim template and posts as internal comment', async () => {
    const addInternal = vi.fn(async () => ({
      comment_id: 'cm-1',
      description: '...',
      comment_type: 'internal' as const,
    }));
    const client = stubClient({ addInternalComment: addInternal });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/post-intake-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_type: 'estimate',
        document_id: 'e-1',
        service_type: 'ROUTINE MOBILE SERVICE',
        scheduled_for: '04-May-2026 01:00 PM',
        rv: { year: 2017, make: 'Forest River', model: 'Vibe', length_ft: 34 },
        vin: 'V123',
        customer_statement: 'leak around vent',
        service_address: '1 Oak St, Salisbury, NC',
        distance_miles: 12,
        phone: '7045550000',
        email: 'a@b.test',
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { posted_text: string };
    expect(data.posted_text).toContain('ROUTINE MOBILE SERVICE REQUESTED FOR 04-May-2026 01:00 PM');
    expect(data.posted_text).toContain('RV Info: 2017 Forest River Vibe, 34 ft');
    expect(data.posted_text).toContain('Distance: 12 m');
    expect(addInternal).toHaveBeenCalledWith(
      'estimate',
      'e-1',
      expect.stringContaining('VIN: V123'),
    );
  });
});

describe('GET /zoho/items', () => {
  it('returns the auto-paginated full list when no modified_since query is passed', async () => {
    const listAll = vi.fn(
      async () => [{ item_id: 'a' }, { item_id: 'b' }] as unknown as ZohoItem[],
    );
    const client = stubClient({ listAllItems: listAll });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/items');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: { item_id: string }[] };
    expect(data.items).toHaveLength(2);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it('forwards modified_since for incremental sync', async () => {
    const list = vi.fn(async () => ({
      code: 0,
      message: 'ok',
      items: [{ item_id: 'a' }] as unknown as ZohoItem[],
      page_context: { page: 1, per_page: 200, has_more_page: false },
    }));
    const client = stubClient({ listItems: list });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/items', {
      searchParams: { modified_since: '2026-05-01T00:00:00Z' },
    });
    expect(res.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ modified_since: '2026-05-01T00:00:00Z' });
  });
});

describe('POST /zoho/record-payment', () => {
  it('rejects when invoice_applications is empty', async () => {
    const app = buildZohoRouter(() => stubClient());
    const res = await call(app, '/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: 'c-1',
        amount: 100,
        payment_method: 'cash',
        invoice_applications: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('forwards to ZohoClient.recordPayment on valid input', async () => {
    const record = vi.fn(async () => ({
      payment_id: 'p-1',
      customer_id: 'c-1',
      customer_name: 'X',
      amount: 100,
      payment_mode: 'Cash',
      date: '2026-05-08',
    }));
    const client = stubClient({ recordPayment: record });
    const app = buildZohoRouter(() => client);
    const res = await call(app, '/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: 'c-1',
        amount: 100,
        payment_method: 'cash',
        invoice_applications: [{ invoice_id: 'i-1', amount: 100 }],
      }),
    });
    expect(res.status).toBe(201);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
