/**
 * Zoho Books invoices endpoint helpers.
 *
 * Numbering convention is `INV-NNNNNN` (auto-assigned). Default payment_terms
 * is 0 (Due on Receipt), matching the org-wide pattern from planning/14.
 */

import type { EstimateLineItemInput, ZohoEstimateLineItem } from './estimates.js';
import { type ZohoFetchContext, zohoFetch } from './fetch.js';
import { INVOICE_NOTES_TEXT, INVOICE_TERMS_TEXT } from './templates.js';

export interface ZohoInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  date: string;
  due_date?: string;
  payment_terms: number;
  payment_terms_label: string;
  total: number;
  sub_total: number;
  tax_total: number;
  balance: number;
  notes?: string;
  terms?: string;
  line_items: ZohoEstimateLineItem[];
  created_time?: string;
  last_modified_time?: string;
  /** Allow forward-compatible additions. */
  [extraField: string]: unknown;
}

interface InvoiceResponse {
  code: number;
  message: string;
  invoice: ZohoInvoice;
}

export interface CreateInvoiceInput {
  customer_id: string;
  line_items: EstimateLineItemInput[];
  date?: string;
  /** Defaults to 0 (Due on Receipt). */
  payment_terms?: number;
  payment_terms_label?: string;
  /** Customer-visible warranty notes. Defaults to verbatim invoice notes. */
  customer_notes?: string;
  /** Customer-visible invoice terms. Defaults to verbatim invoice terms. */
  terms?: string;
  send?: boolean;
}

export async function createInvoice(
  ctx: ZohoFetchContext,
  input: CreateInvoiceInput,
): Promise<ZohoInvoice> {
  const payload = {
    customer_id: input.customer_id,
    line_items: input.line_items.map((li) => ({
      item_id: li.item_id,
      quantity: li.quantity,
      ...(li.rate !== undefined ? { rate: li.rate } : {}),
      ...(li.description ? { description: li.description } : {}),
    })),
    notes: input.customer_notes ?? INVOICE_NOTES_TEXT,
    terms: input.terms ?? INVOICE_TERMS_TEXT,
    payment_terms: input.payment_terms ?? 0,
    payment_terms_label: input.payment_terms_label ?? 'Due on Receipt',
    ...(input.date ? { date: input.date } : {}),
  };
  const query: Record<string, string | number | boolean | undefined> = {};
  if (input.send) query.send = true;
  const data = await zohoFetch<InvoiceResponse>(ctx, '/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
    query,
  });
  return data.invoice;
}

export async function getInvoice(ctx: ZohoFetchContext, invoiceId: string): Promise<ZohoInvoice> {
  const data = await zohoFetch<InvoiceResponse>(ctx, `/invoices/${invoiceId}`);
  return data.invoice;
}

interface ConvertEstimateResponse {
  code: number;
  message: string;
  invoice: ZohoInvoice;
}

/**
 * Convert an accepted estimate into an invoice. Per Zoho's API the estimate
 * must be in `accepted` (or `sent`) state.
 */
export async function convertEstimateToInvoice(
  ctx: ZohoFetchContext,
  estimateId: string,
): Promise<ZohoInvoice> {
  const data = await zohoFetch<ConvertEstimateResponse>(ctx, `/estimates/${estimateId}/convert`, {
    method: 'POST',
  });
  return data.invoice;
}
