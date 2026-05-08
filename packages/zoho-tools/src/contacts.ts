/**
 * Zoho Books contacts (customers) endpoint helpers.
 *
 * Org conventions discovered in planning/14-zoho-org-schema.md:
 *   - All RRR contacts use `contact_type='customer'` + `customer_sub_type='individual'`.
 *   - Payment terms are universally "Due on Receipt".
 *   - RV info lives in the `notes` field as free text (e.g. "2017 Forest River Vibe, 34 ft").
 *   - `mobile` is the working phone; `phone` is usually blank.
 *   - `is_sms_enabled` tracks SMS consent — default true to mirror Zoho's behavior.
 *
 * Tools the rest of the system maps onto these helpers:
 *   - `lookup_customer` → searchContacts / getContact
 *   - `create_customer` → createContact
 *   - `get_customer_history` → getContactHistory
 */

import { type ZohoFetchContext, zohoFetch } from './fetch.js';
import type { PageContext } from './items.js';

export interface ZohoAddress {
  attention?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  contact_type: 'customer' | 'vendor' | string;
  customer_sub_type: 'individual' | 'business' | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  notes?: string;
  is_sms_enabled?: boolean;
  payment_terms?: number;
  payment_terms_label?: string;
  billing_address?: ZohoAddress;
  shipping_address?: ZohoAddress;
  outstanding_receivable_amount?: number;
  last_modified_time?: string;
  created_time?: string;
  status?: string;
  /** Allow Zoho to add fields without breaking the typed surface. */
  [extraField: string]: unknown;
}

export interface ContactsListResponse {
  code: number;
  message: string;
  contacts: ZohoContact[];
  page_context?: PageContext;
}

export interface ContactDetailResponse {
  code: number;
  message: string;
  contact: ZohoContact;
}

export interface SearchContactsQuery {
  /** Server-side search across name, email, phone, mobile. */
  search_text?: string;
  page?: number;
  per_page?: number;
  /** Default ranking: most-recently-modified first (matches "what did we just do for them?" UX). */
  sort_column?: string;
  sort_order?: 'A' | 'D';
  /** Filter by contact_type, status, etc. */
  filter_by?: string;
}

export async function searchContacts(
  ctx: ZohoFetchContext,
  query: SearchContactsQuery = {},
): Promise<ContactsListResponse> {
  return zohoFetch<ContactsListResponse>(ctx, '/contacts', {
    query: {
      sort_column: 'last_modified_time',
      sort_order: 'D',
      per_page: 25,
      ...query,
    } as Record<string, string | number | boolean | undefined>,
  });
}

export async function getContact(ctx: ZohoFetchContext, contactId: string): Promise<ZohoContact> {
  const data = await zohoFetch<ContactDetailResponse>(ctx, `/contacts/${contactId}`);
  return data.contact;
}

export interface CreateContactInput {
  first_name: string;
  last_name: string;
  /** Either email or mobile is required by Zoho. We require both per intake schema. */
  email: string;
  mobile: string;
  billing_address?: ZohoAddress;
  /** Free-text RV info — will be stored on the contact's `notes` field. */
  notes?: string;
  /**
   * SMS opt-in. Defaults to `true` to match Zoho's default; the intake form
   * already requires explicit opt-in via `consent_sms`, so the caller should
   * pass `false` only if the customer declined.
   */
  is_sms_enabled?: boolean;
}

export async function createContact(
  ctx: ZohoFetchContext,
  input: CreateContactInput,
): Promise<ZohoContact> {
  const payload = {
    contact_name: `${input.first_name} ${input.last_name}`.trim(),
    contact_type: 'customer' as const,
    customer_sub_type: 'individual' as const,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    mobile: input.mobile,
    is_sms_enabled: input.is_sms_enabled ?? true,
    payment_terms: 0,
    payment_terms_label: 'Due on Receipt',
    ...(input.billing_address ? { billing_address: input.billing_address } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
  const data = await zohoFetch<ContactDetailResponse>(ctx, '/contacts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.contact;
}

export interface CustomerHistoryEntry {
  document_type: 'estimate' | 'invoice';
  document_id: string;
  number: string;
  status: string;
  total: number;
  date: string;
}

interface ContactInvoicesResponse {
  invoices: Array<{
    invoice_id: string;
    invoice_number: string;
    status: string;
    total: number;
    date: string;
  }>;
}

interface ContactEstimatesResponse {
  estimates: Array<{
    estimate_id: string;
    estimate_number: string;
    status: string;
    total: number;
    date: string;
  }>;
}

/**
 * Returns the most recent estimates + invoices for a contact, merged and
 * sorted by date descending. Used by `get_customer_history` (planning/06).
 */
export async function getContactHistory(
  ctx: ZohoFetchContext,
  contactId: string,
  limit = 10,
): Promise<CustomerHistoryEntry[]> {
  const [invoices, estimates] = await Promise.all([
    zohoFetch<ContactInvoicesResponse>(ctx, '/invoices', {
      query: { customer_id: contactId, per_page: limit, sort_column: 'date', sort_order: 'D' },
    }),
    zohoFetch<ContactEstimatesResponse>(ctx, '/estimates', {
      query: { customer_id: contactId, per_page: limit, sort_column: 'date', sort_order: 'D' },
    }),
  ]);
  const merged: CustomerHistoryEntry[] = [
    ...invoices.invoices.map((i) => ({
      document_type: 'invoice' as const,
      document_id: i.invoice_id,
      number: i.invoice_number,
      status: i.status,
      total: i.total,
      date: i.date,
    })),
    ...estimates.estimates.map((e) => ({
      document_type: 'estimate' as const,
      document_id: e.estimate_id,
      number: e.estimate_number,
      status: e.status,
      total: e.total,
      date: e.date,
    })),
  ];
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged.slice(0, limit);
}
