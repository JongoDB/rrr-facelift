/**
 * Zoho Books estimates endpoint helpers.
 *
 * Org conventions (planning/14):
 *   - Estimate numbers `QT-NNNNNN` are auto-assigned by Zoho.
 *   - `notes` carries the verbatim warranty disclaimer (customer-visible).
 *   - `terms` carries the verbatim quote terms (customer-visible).
 *   - Line items reference catalog items by `item_id`; `name` and `rate` may
 *     be overridden per line.
 *   - `custom_fields` is unsupported by Zoho's API — we never set it.
 *
 * The CUSTOMER-VISIBLE warranty + terms blocks are constants; the full
 * verbatim text lives in src/templates.ts so Phase 02 reuses them on every
 * create — owners want the new flow's documents to look identical to today's.
 */

import { type ZohoFetchContext, zohoFetch } from './fetch.js';
import { ESTIMATE_TERMS_TEXT, WARRANTY_NOTES_TEXT } from './templates.js';

export interface EstimateLineItemInput {
  /** Zoho item_id from the catalog mirror. */
  item_id: string;
  quantity: number;
  /** Optional override of the item's default rate. */
  rate?: number;
  /** Optional per-line addendum (appointment time, parts variant, etc.). */
  description?: string;
}

export interface ZohoEstimateLineItem {
  line_item_id?: string;
  item_id: string;
  name: string;
  description?: string;
  rate: number;
  quantity: number;
  item_total?: number;
  /** Allow forward-compatible additions. */
  [extraField: string]: unknown;
}

export interface ZohoEstimate {
  estimate_id: string;
  estimate_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  date: string;
  expiry_date?: string;
  total: number;
  sub_total: number;
  tax_total: number;
  notes?: string;
  terms?: string;
  line_items: ZohoEstimateLineItem[];
  created_time?: string;
  last_modified_time?: string;
  /** Allow forward-compatible additions. */
  [extraField: string]: unknown;
}

interface EstimateResponse {
  code: number;
  message: string;
  estimate: ZohoEstimate;
}

export interface CreateEstimateInput {
  customer_id: string;
  line_items: EstimateLineItemInput[];
  /** Date string `YYYY-MM-DD`. Defaults to today (caller's clock). */
  date?: string;
  /** Reference number visible on the PDF. Optional — RRR doesn't normally use it. */
  reference_number?: string;
  /**
   * Customer-visible notes block. Defaults to the verbatim warranty disclaimer
   * RRR uses on every doc today. Pass an empty string to suppress.
   */
  customer_notes?: string;
  /** Customer-visible terms block. Defaults to the verbatim quote terms. */
  terms?: string;
  /** If true, send to customer immediately. Default false (draft). */
  send?: boolean;
}

export async function createEstimate(
  ctx: ZohoFetchContext,
  input: CreateEstimateInput,
): Promise<ZohoEstimate> {
  const payload = {
    customer_id: input.customer_id,
    line_items: input.line_items.map((li) => ({
      item_id: li.item_id,
      quantity: li.quantity,
      ...(li.rate !== undefined ? { rate: li.rate } : {}),
      ...(li.description ? { description: li.description } : {}),
    })),
    notes: input.customer_notes ?? WARRANTY_NOTES_TEXT,
    terms: input.terms ?? ESTIMATE_TERMS_TEXT,
    ...(input.date ? { date: input.date } : {}),
    ...(input.reference_number ? { reference_number: input.reference_number } : {}),
  };
  const query: Record<string, string | number | boolean | undefined> = {};
  if (input.send) query.send = true;
  const data = await zohoFetch<EstimateResponse>(ctx, '/estimates', {
    method: 'POST',
    body: JSON.stringify(payload),
    query,
  });
  return data.estimate;
}

export async function getEstimate(
  ctx: ZohoFetchContext,
  estimateId: string,
): Promise<ZohoEstimate> {
  const data = await zohoFetch<EstimateResponse>(ctx, `/estimates/${estimateId}`);
  return data.estimate;
}

/**
 * Append line items to an existing draft estimate. Errors if the estimate is
 * already sent or accepted (Zoho enforces this).
 */
export async function addLinesToEstimate(
  ctx: ZohoFetchContext,
  estimateId: string,
  lineItems: EstimateLineItemInput[],
): Promise<ZohoEstimate> {
  const existing = await getEstimate(ctx, estimateId);
  const merged = [
    ...existing.line_items.map((li) => ({
      item_id: li.item_id,
      quantity: li.quantity,
      rate: li.rate,
      description: li.description,
    })),
    ...lineItems.map((li) => ({
      item_id: li.item_id,
      quantity: li.quantity,
      ...(li.rate !== undefined ? { rate: li.rate } : {}),
      ...(li.description ? { description: li.description } : {}),
    })),
  ];
  const data = await zohoFetch<EstimateResponse>(ctx, `/estimates/${estimateId}`, {
    method: 'PUT',
    body: JSON.stringify({ line_items: merged }),
  });
  return data.estimate;
}
