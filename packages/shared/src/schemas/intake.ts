import { z } from 'zod';

/**
 * Customer intake form — the payload submitted from the website to the n8n
 * webhook at flows.triple-r-rv.com/webhook/intake. Spec: planning/07-n8n-workflows.md.
 */

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s().-]{10,20}$/, 'Phone must look like a US phone number');

export const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
});

export const customerSchema = z.object({
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  phone: phoneSchema,
  email: z.string().email(),
  address: addressSchema.optional(),
});

export const rvSchema = z.object({
  year: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 2),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  length_ft: z.number().positive().max(80).optional(),
});

export const intakeSchema = z
  .object({
    request_id: z.string().uuid(),
    service_type: z.enum(['mobile', 'shop']),
    customer: customerSchema,
    rv: rvSchema,
    problem_description: z.string().min(10).max(4000),
    photos: z.array(z.string().url()).max(5).optional(),
    preferred_window: z.string().max(200),
    emergency: z.boolean(),
    consent_sms: z.literal(true, {
      errorMap: () => ({ message: 'SMS consent is required to receive job updates.' }),
    }),
  })
  .strict()
  .refine((data) => data.service_type !== 'mobile' || data.customer.address !== undefined, {
    message: 'Mobile service requires a customer address.',
    path: ['customer', 'address'],
  });

export type Intake = z.infer<typeof intakeSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Rv = z.infer<typeof rvSchema>;
