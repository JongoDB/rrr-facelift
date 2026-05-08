/**
 * Zoho Books customer payments endpoint helpers.
 *
 * Used by the `record_payment` tool — the tech reports payment received in
 * the field (cash, check, card via Square, etc.) and the system applies it
 * against one or more invoices.
 */

import { type ZohoFetchContext, zohoFetch } from './fetch.js';

export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'other';

export interface ZohoCustomerPayment {
  payment_id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  payment_mode: string;
  reference_number?: string;
  date: string;
  invoices?: Array<{ invoice_id: string; amount_applied: number }>;
  /** Allow forward-compatible additions. */
  [extraField: string]: unknown;
}

interface PaymentResponse {
  code: number;
  message: string;
  payment: ZohoCustomerPayment;
}

export interface RecordPaymentInput {
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  /** Check #, last-4 of card, etc. Optional. */
  reference?: string;
  /** ISO date string. Defaults to today. */
  date?: string;
  /** One or more invoices to apply the payment against, with the amount per. */
  invoice_applications: Array<{ invoice_id: string; amount: number }>;
}

const PAYMENT_MODE_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Credit Card',
  ach: 'Bank Transfer',
  other: 'Other',
};

export async function recordPayment(
  ctx: ZohoFetchContext,
  input: RecordPaymentInput,
): Promise<ZohoCustomerPayment> {
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    customer_id: input.customer_id,
    amount: input.amount,
    payment_mode: PAYMENT_MODE_LABEL[input.payment_method],
    date: input.date ?? today,
    ...(input.reference ? { reference_number: input.reference } : {}),
    invoices: input.invoice_applications.map((a) => ({
      invoice_id: a.invoice_id,
      amount_applied: a.amount,
    })),
  };
  const data = await zohoFetch<PaymentResponse>(ctx, '/customerpayments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.payment;
}
