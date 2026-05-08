import { z } from 'zod';

/**
 * Line item shape used by Claude tool input (create_estimate / create_invoice)
 * and the tech PWA review screen. Spec: planning/06-zoho-integration.md.
 */
export const lineItemSchema = z
  .object({
    catalog_item_id: z.string().min(1),
    quantity: z.number().min(0.25),
    rate_override: z.number().nonnegative().optional(),
    description_suffix: z.string().max(500).optional(),
  })
  .strict();

export const lineItemArraySchema = z.array(lineItemSchema).min(1).max(50);

export type LineItem = z.infer<typeof lineItemSchema>;
