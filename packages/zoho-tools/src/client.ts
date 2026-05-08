/**
 * High-level Zoho Books client.
 *
 *   const client = createZohoClient(config);
 *   const items = await client.listAllItems();
 *
 * The factory caches the OAuth access token, coalesces concurrent token-mint
 * requests into one inflight promise, and exposes typed accessors for each
 * entity. Per-entity helpers live in adjacent files (items.ts, contacts.ts, …).
 */

import { type AccessToken, mintAccessToken } from './auth.js';
import {
  addCustomerComment,
  addInternalComment,
  type CommentType,
  type DocumentType,
  listComments,
  listInternalComments,
  type ZohoComment,
} from './comments.js';
import type { ZohoConfig } from './config.js';
import {
  type ContactsListResponse,
  type CreateContactInput,
  type CustomerHistoryEntry,
  createContact,
  getContact,
  getContactHistory,
  type SearchContactsQuery,
  searchContacts,
  type ZohoContact,
} from './contacts.js';
import {
  addLinesToEstimate,
  type CreateEstimateInput,
  createEstimate,
  type EstimateLineItemInput,
  getEstimate,
  type ZohoEstimate,
} from './estimates.js';
import { type ZohoFetchContext, type ZohoFetchOptions, zohoFetch } from './fetch.js';
import {
  type CreateInvoiceInput,
  convertEstimateToInvoice,
  createInvoice,
  getInvoice,
  type ZohoInvoice,
} from './invoices.js';
import {
  type ItemsListResponse,
  type ListItemsQuery,
  listAllItems,
  listItems,
  type ZohoItem,
} from './items.js';
import { type RecordPaymentInput, recordPayment, type ZohoCustomerPayment } from './payments.js';

export interface ZohoClient {
  /** Direct fetch for endpoints not yet wrapped in typed methods. */
  fetch: <T = unknown>(path: string, options?: ZohoFetchOptions) => Promise<T>;
  /** For tests / debugging. */
  getAccessToken: () => Promise<string>;

  // ── Items / catalog ─────────────────────────────────────────────────────
  listItems: (query?: ListItemsQuery) => Promise<ItemsListResponse>;
  listAllItems: (query?: Omit<ListItemsQuery, 'page' | 'per_page'>) => Promise<ZohoItem[]>;

  // ── Contacts / customers ────────────────────────────────────────────────
  searchContacts: (query?: SearchContactsQuery) => Promise<ContactsListResponse>;
  getContact: (contactId: string) => Promise<ZohoContact>;
  createContact: (input: CreateContactInput) => Promise<ZohoContact>;
  getContactHistory: (contactId: string, limit?: number) => Promise<CustomerHistoryEntry[]>;

  // ── Estimates ───────────────────────────────────────────────────────────
  createEstimate: (input: CreateEstimateInput) => Promise<ZohoEstimate>;
  getEstimate: (estimateId: string) => Promise<ZohoEstimate>;
  addLinesToEstimate: (
    estimateId: string,
    lineItems: EstimateLineItemInput[],
  ) => Promise<ZohoEstimate>;

  // ── Invoices ────────────────────────────────────────────────────────────
  createInvoice: (input: CreateInvoiceInput) => Promise<ZohoInvoice>;
  getInvoice: (invoiceId: string) => Promise<ZohoInvoice>;
  convertEstimateToInvoice: (estimateId: string) => Promise<ZohoInvoice>;

  // ── Comments ────────────────────────────────────────────────────────────
  listComments: (documentType: DocumentType, documentId: string) => Promise<ZohoComment[]>;
  listInternalComments: (documentType: DocumentType, documentId: string) => Promise<ZohoComment[]>;
  addInternalComment: (
    documentType: DocumentType,
    documentId: string,
    description: string,
  ) => Promise<ZohoComment>;
  addCustomerComment: (
    documentType: DocumentType,
    documentId: string,
    description: string,
  ) => Promise<ZohoComment>;

  // ── Payments ────────────────────────────────────────────────────────────
  recordPayment: (input: RecordPaymentInput) => Promise<ZohoCustomerPayment>;
}

export type { CommentType, DocumentType };

/** Refresh ~60s before expiry to avoid edge-case 401s. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export function createZohoClient(
  config: ZohoConfig,
  options: { fetchImpl?: typeof fetch } = {},
): ZohoClient {
  let cachedToken: AccessToken | null = null;
  let inflight: Promise<AccessToken> | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.token;
    }
    inflight ??= mintAccessToken(config, options.fetchImpl).finally(() => {
      inflight = null;
    });
    cachedToken = await inflight;
    return cachedToken.token;
  }

  const ctx: ZohoFetchContext = {
    config,
    getAccessToken,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  const fetchTyped = <T>(path: string, opts?: ZohoFetchOptions) => zohoFetch<T>(ctx, path, opts);

  return {
    fetch: fetchTyped,
    getAccessToken,
    listItems: (query) => listItems(ctx, query),
    listAllItems: (query) => listAllItems(ctx, query),
    searchContacts: (query) => searchContacts(ctx, query),
    getContact: (id) => getContact(ctx, id),
    createContact: (input) => createContact(ctx, input),
    getContactHistory: (id, limit) => getContactHistory(ctx, id, limit),
    createEstimate: (input) => createEstimate(ctx, input),
    getEstimate: (id) => getEstimate(ctx, id),
    addLinesToEstimate: (id, lineItems) => addLinesToEstimate(ctx, id, lineItems),
    createInvoice: (input) => createInvoice(ctx, input),
    getInvoice: (id) => getInvoice(ctx, id),
    convertEstimateToInvoice: (id) => convertEstimateToInvoice(ctx, id),
    listComments: (type, id) => listComments(ctx, type, id),
    listInternalComments: (type, id) => listInternalComments(ctx, type, id),
    addInternalComment: (type, id, desc) => addInternalComment(ctx, type, id, desc),
    addCustomerComment: (type, id, desc) => addCustomerComment(ctx, type, id, desc),
    recordPayment: (input) => recordPayment(ctx, input),
  };
}
