/**
 * /zoho/* — Worker endpoints n8n calls during the intake workflow.
 *
 * Each route validates its body via zod, builds a ZohoClient from env, and
 * dispatches to the typed helper. Routes are intentionally thin; the heavy
 * lifting lives in @rrr/zoho-tools. We don't hide validation errors — they
 * come back as 400 with the zod-flattened detail so n8n's HTTP node can log
 * them clearly.
 */

import {
  buildIntakeTemplate,
  type IntakeServiceType,
  type ZohoAddress,
  type ZohoClient,
} from '@rrr/zoho-tools';
import { Hono } from 'hono';
import { z } from 'zod';
import { buildZohoClient, type Env } from '../env.js';

/**
 * Allow tests to inject a stub client without monkey-patching globals. In
 * production we always pass the real factory.
 */
export type ZohoClientFactory = (env: Env) => ZohoClient;

const zohoAddressSchema = z
  .object({
    attention: z.string().max(160).optional(),
    address: z.string().max(160).optional(),
    street2: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    state: z.string().max(80).optional(),
    zip: z.string().max(20).optional(),
    country: z.string().max(80).optional(),
    phone: z.string().max(40).optional(),
  })
  .strict();

const upsertContactSchema = z
  .object({
    first_name: z.string().min(1).max(80),
    last_name: z.string().min(1).max(80),
    email: z.string().email(),
    mobile: z.string().min(7).max(40),
    billing_address: zohoAddressSchema.optional(),
    notes: z.string().max(2000).optional(),
    is_sms_enabled: z.boolean().optional(),
  })
  .strict();

const lineItemSchema = z
  .object({
    item_id: z.string().min(1),
    quantity: z.number().min(0.25),
    rate: z.number().nonnegative().optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();

const createEstimateSchema = z
  .object({
    customer_id: z.string().min(1),
    line_items: z.array(lineItemSchema).min(1).max(50),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    reference_number: z.string().max(100).optional(),
    customer_notes: z.string().max(4000).optional(),
    terms: z.string().max(4000).optional(),
    send: z.boolean().optional(),
  })
  .strict();

const createInvoiceSchema = createEstimateSchema.extend({
  payment_terms: z.number().int().nonnegative().optional(),
  payment_terms_label: z.string().max(80).optional(),
});

const addCommentSchema = z
  .object({
    document_type: z.enum(['estimate', 'invoice']),
    document_id: z.string().min(1),
    description: z.string().min(1).max(8000),
    visibility: z.enum(['internal', 'customer']).default('internal'),
  })
  .strict();

const intakeTemplateSchema = z
  .object({
    document_type: z.enum(['estimate', 'invoice']),
    document_id: z.string().min(1),
    service_type: z.enum(['ROUTINE MOBILE SERVICE', 'EMERGENCY MOBILE SERVICE', 'ON-SITE SERVICE']),
    scheduled_for: z.string().max(80).optional(),
    rv: z.object({
      year: z
        .number()
        .int()
        .min(1950)
        .max(new Date().getFullYear() + 2),
      make: z.string().min(1).max(60),
      model: z.string().min(1).max(80),
      length_ft: z.number().positive().max(80).optional(),
    }),
    vin: z.string().max(40).optional(),
    customer_statement: z.string().min(1).max(4000),
    service_address: z.string().max(400).optional(),
    gate_code: z.string().max(80).optional(),
    parking_instructions: z.string().max(400).optional(),
    distance_miles: z.number().nonnegative().max(500).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional(),
  })
  .strict();

const recordPaymentSchema = z
  .object({
    customer_id: z.string().min(1),
    amount: z.number().positive(),
    payment_method: z.enum(['cash', 'check', 'card', 'ach', 'other']),
    reference: z.string().max(100).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    invoice_applications: z
      .array(z.object({ invoice_id: z.string().min(1), amount: z.number().positive() }))
      .min(1)
      .max(50),
  })
  .strict();

export function buildZohoRouter(getClient: ZohoClientFactory = buildZohoClient) {
  const app = new Hono<{ Bindings: Env }>();

  /**
   * POST /zoho/upsert-contact
   * n8n's intake workflow calls this with the validated form payload. The
   * route searches by mobile first (most reliable per planning/14 — `mobile`
   * is the working number on RRR contacts), then by email if no hit. Returns
   * `{ created, contact }` so n8n knows whether to log a "new customer"
   * event.
   */
  app.post('/upsert-contact', async (c) => {
    const parsed = upsertContactSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const client = getClient(c.env);
    const normalizedMobile = parsed.data.mobile.replace(/\D+/g, '');
    const byMobile = await client.searchContacts({ search_text: normalizedMobile });
    let existing = byMobile.contacts[0];
    if (!existing) {
      const byEmail = await client.searchContacts({ search_text: parsed.data.email });
      existing = byEmail.contacts.find(
        (c2) => c2.email?.toLowerCase() === parsed.data.email.toLowerCase(),
      );
    }
    if (existing) {
      return c.json({ created: false, contact: existing });
    }
    const created = await client.createContact(parsed.data);
    return c.json({ created: true, contact: created }, 201);
  });

  /** POST /zoho/create-estimate */
  app.post('/create-estimate', async (c) => {
    const parsed = createEstimateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const client = getClient(c.env);
    const estimate = await client.createEstimate(parsed.data);
    return c.json({ estimate }, 201);
  });

  /** POST /zoho/create-invoice */
  app.post('/create-invoice', async (c) => {
    const parsed = createInvoiceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const client = getClient(c.env);
    const invoice = await client.createInvoice(parsed.data);
    return c.json({ invoice }, 201);
  });

  /** POST /zoho/add-comment — internal by default. */
  app.post('/add-comment', async (c) => {
    const parsed = addCommentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const client = getClient(c.env);
    const { document_type, document_id, description, visibility } = parsed.data;
    const comment =
      visibility === 'customer'
        ? await client.addCustomerComment(document_type, document_id, description)
        : await client.addInternalComment(document_type, document_id, description);
    return c.json({ comment }, 201);
  });

  /**
   * POST /zoho/post-intake-template — convenience for the intake workflow.
   * Builds the verbatim Jonathan-template format and posts it as an internal
   * comment in one call.
   */
  app.post('/post-intake-template', async (c) => {
    const parsed = intakeTemplateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const text = buildIntakeTemplate({
      service_type: parsed.data.service_type as IntakeServiceType,
      ...(parsed.data.scheduled_for ? { scheduled_for: parsed.data.scheduled_for } : {}),
      rv: parsed.data.rv,
      ...(parsed.data.vin ? { vin: parsed.data.vin } : {}),
      customer_statement: parsed.data.customer_statement,
      ...(parsed.data.service_address ? { service_address: parsed.data.service_address } : {}),
      ...(parsed.data.gate_code ? { gate_code: parsed.data.gate_code } : {}),
      ...(parsed.data.parking_instructions
        ? { parking_instructions: parsed.data.parking_instructions }
        : {}),
      ...(parsed.data.distance_miles !== undefined
        ? { distance_miles: parsed.data.distance_miles }
        : {}),
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.email ? { email: parsed.data.email } : {}),
    });
    const client = getClient(c.env);
    const comment = await client.addInternalComment(
      parsed.data.document_type,
      parsed.data.document_id,
      text,
    );
    return c.json({ comment, posted_text: text }, 201);
  });

  /** POST /zoho/record-payment */
  app.post('/record-payment', async (c) => {
    const parsed = recordPaymentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }
    const client = getClient(c.env);
    const payment = await client.recordPayment(parsed.data);
    return c.json({ payment }, 201);
  });

  /**
   * GET /zoho/items — used by the hourly sync workflow. `modified_since` lets
   * the workflow do incremental fetches. We auto-paginate via listAllItems
   * when no `modified_since` is passed (full sync); otherwise we forward the
   * single page as Zoho returns it (the sync window is small enough).
   */
  app.get('/items', async (c) => {
    const modifiedSince = c.req.query('modified_since');
    const client = getClient(c.env);
    if (modifiedSince) {
      const page = await client.listItems({ modified_since: modifiedSince });
      return c.json({ items: page.items, page_context: page.page_context });
    }
    const items = await client.listAllItems();
    return c.json({ items });
  });

  /** GET /zoho/contacts/:id/history */
  app.get('/contacts/:id/history', async (c) => {
    const id = c.req.param('id');
    const limit = Number(c.req.query('limit') ?? '10');
    const client = getClient(c.env);
    const history = await client.getContactHistory(id, Number.isFinite(limit) ? limit : 10);
    return c.json({ history });
  });

  return app;
}

export type { ZohoAddress };
