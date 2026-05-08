import { describe, expect, it } from 'vitest';
import { intakeSchema } from './intake.js';

const baseIntake = {
  request_id: '00000000-0000-4000-8000-000000000000',
  service_type: 'shop' as const,
  customer: {
    first_name: 'John',
    last_name: 'Smith',
    phone: '704-555-0142',
    email: 'john@example.com',
  },
  rv: {
    year: 2018,
    make: 'Forest River',
    model: 'Cherokee',
    length_ft: 28,
  },
  problem_description: 'Leak around the front cap after last storm.',
  preferred_window: 'next two weeks, weekday morning',
  emergency: false,
  consent_sms: true as const,
};

describe('intakeSchema', () => {
  it('accepts a valid shop submission', () => {
    expect(() => intakeSchema.parse(baseIntake)).not.toThrow();
  });

  it('requires an address for mobile submissions', () => {
    const result = intakeSchema.safeParse({ ...baseIntake, service_type: 'mobile' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid mobile submission with address', () => {
    const result = intakeSchema.safeParse({
      ...baseIntake,
      service_type: 'mobile',
      customer: {
        ...baseIntake.customer,
        address: { street: '123 Main St', city: 'Salisbury', state: 'NC', zip: '28144' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown extra fields (strict)', () => {
    const result = intakeSchema.safeParse({ ...baseIntake, surprise: true });
    expect(result.success).toBe(false);
  });
});
