/**
 * Zoho Books comments endpoint helpers for estimates and invoices.
 *
 * Comment-type semantics (planning/14):
 *   - `system` — Zoho audit log (created/updated/converted). Read-only; never post.
 *   - `internal` — RRR-staff notes. Never customer-visible. **The primary
 *     channel** for tech voice transcripts, parts/cost lookups, and the
 *     structured intake template Jonathan posts on every fresh estimate.
 *   - `customer` — Customer-facing. Use sparingly.
 */

import { type ZohoFetchContext, zohoFetch } from './fetch.js';

export type DocumentType = 'estimate' | 'invoice';
export type CommentType = 'system' | 'internal' | 'customer';

export interface ZohoComment {
  comment_id: string;
  /** Document this comment is attached to. */
  estimate_id?: string;
  invoice_id?: string;
  description: string;
  comment_type: CommentType;
  commented_by_id?: string;
  commented_by?: string;
  date?: string;
  date_description?: string;
  time?: string;
  /** Allow forward-compatible additions. */
  [extraField: string]: unknown;
}

interface CommentsListResponse {
  code: number;
  message: string;
  comments: ZohoComment[];
}

interface CommentResponse {
  code: number;
  message: string;
  comment: ZohoComment;
}

function commentsPath(documentType: DocumentType, documentId: string): string {
  return `/${documentType === 'estimate' ? 'estimates' : 'invoices'}/${documentId}/comments`;
}

export async function listComments(
  ctx: ZohoFetchContext,
  documentType: DocumentType,
  documentId: string,
): Promise<ZohoComment[]> {
  const data = await zohoFetch<CommentsListResponse>(ctx, commentsPath(documentType, documentId));
  return data.comments;
}

/** Subset of comments where `comment_type === 'internal'`. Tech-only context. */
export async function listInternalComments(
  ctx: ZohoFetchContext,
  documentType: DocumentType,
  documentId: string,
): Promise<ZohoComment[]> {
  const all = await listComments(ctx, documentType, documentId);
  return all.filter((c) => c.comment_type === 'internal');
}

export async function addInternalComment(
  ctx: ZohoFetchContext,
  documentType: DocumentType,
  documentId: string,
  description: string,
): Promise<ZohoComment> {
  const data = await zohoFetch<CommentResponse>(ctx, commentsPath(documentType, documentId), {
    method: 'POST',
    body: JSON.stringify({ description, show_comment_to_clients: false }),
  });
  return data.comment;
}

export async function addCustomerComment(
  ctx: ZohoFetchContext,
  documentType: DocumentType,
  documentId: string,
  description: string,
): Promise<ZohoComment> {
  const data = await zohoFetch<CommentResponse>(ctx, commentsPath(documentType, documentId), {
    method: 'POST',
    body: JSON.stringify({ description, show_comment_to_clients: true }),
  });
  return data.comment;
}

/* ───────────────────────── Intake template helper ─────────────────────────
 *
 * This builds the verbatim format Jonathan currently posts by hand on every
 * fresh estimate (per planning/14 + planning/06). Phase 02 calls this and
 * passes the result into addInternalComment.
 *
 * Format-stability is critical: techs read these daily.
 */

export type IntakeServiceType =
  | 'ROUTINE MOBILE SERVICE'
  | 'EMERGENCY MOBILE SERVICE'
  | 'ON-SITE SERVICE';

export interface IntakeTemplateInput {
  service_type: IntakeServiceType;
  /** ISO date-time, formatted as "DD-MMM-YYYY HH:MM AM/PM" by the caller if scheduled. */
  scheduled_for?: string;
  rv: { year: number; make: string; model: string; length_ft?: number };
  vin?: string;
  customer_statement: string;
  service_address?: string;
  gate_code?: string;
  parking_instructions?: string;
  distance_miles?: number;
  phone?: string;
  email?: string;
}

export function buildIntakeTemplate(input: IntakeTemplateInput): string {
  const lines: string[] = [];
  lines.push(
    input.scheduled_for
      ? `${input.service_type} REQUESTED FOR ${input.scheduled_for}`
      : `${input.service_type} REQUESTED`,
  );
  lines.push('');
  const rvLengthSuffix = input.rv.length_ft !== undefined ? `, ${input.rv.length_ft} ft` : '';
  lines.push(`RV Info: ${input.rv.year} ${input.rv.make} ${input.rv.model}${rvLengthSuffix}`);
  lines.push(`VIN: ${input.vin?.trim() ? input.vin : 'unsure'}`);
  lines.push('');
  lines.push(`Customer Statement: ${input.customer_statement}`);
  if (input.service_address) {
    lines.push('');
    lines.push(`Service Address: ${input.service_address}`);
    lines.push(`Gate Code (Optional): ${input.gate_code ?? ''}`);
    lines.push(`Parking Instructions (Optional): ${input.parking_instructions ?? ''}`);
  }
  if (input.distance_miles !== undefined) {
    lines.push('');
    // The "m" suffix is verbatim from Jonathan's existing intake template
    // (planning/14). It stands for miles — NOT meters — even though the SI
    // symbol for meter is also "m". Don't normalize to "mi" — techs read
    // these comments daily and any wording change is jarring.
    lines.push(`Distance: ${input.distance_miles} m`);
  }
  if (input.phone || input.email) {
    lines.push('');
    if (input.phone) lines.push(`Phone: ${input.phone}`);
    if (input.email) lines.push(`Email: ${input.email}`);
  }
  return lines.join('\n');
}
