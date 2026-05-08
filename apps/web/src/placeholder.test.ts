import { describe, expect, it } from 'vitest';
import { PHASE_00_WEB_SCAFFOLD } from './placeholder.js';

describe('apps/web scaffold', () => {
  it('exports the phase 00 marker', () => {
    expect(PHASE_00_WEB_SCAFFOLD).toBe(true);
  });
});
