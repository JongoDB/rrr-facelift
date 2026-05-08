import { describe, expect, it, vi } from 'vitest';
import { classifyIntake } from './classify-intake.js';

// We can't easily stub the Anthropic SDK's network layer without the SDK's
// own internals, so these tests focus on the purest pieces — input shape,
// timeout / model defaults, and the parser via a hand-rolled mock fetch
// that the SDK's underlying http client routes through. The Worker route's
// real-vs-stub behavior is covered by apps/api's agent.test.ts; this file
// proves the package boundary.

const baseRequest = {
  service_type: 'mobile' as const,
  rv: { year: 2018, make: 'Forest River', model: 'Vibe', length_ft: 28 },
  problem_description: 'Roof seam leaks during rain near the front cap',
  emergency: false,
};

describe('classifyIntake', () => {
  it('returns source=anthropic when the SDK call succeeds', async () => {
    // Anthropic SDK uses globalThis.fetch by default. Stub it to return a
    // minimal valid Messages API response.
    const stubFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  category: 'roof',
                  summary: 'Front cap leak after rain.',
                  urgency: 'routine',
                  suggested_items: [],
                }),
              },
            ],
            model: 'claude-haiku-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 30 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', stubFetch);
    try {
      const result = await classifyIntake(baseRequest, { apiKey: 'sk-ant-test' });
      expect(result.source).toBe('anthropic');
      expect(result.category).toBe('roof');
      expect(result.urgency).toBe('routine');
      expect(stubFetch).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to category=unknown when the model returns un-parseable text', async () => {
    const stubFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'I cannot help with this' }],
            model: 'claude-haiku-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 10 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', stubFetch);
    try {
      const result = await classifyIntake(baseRequest, { apiKey: 'sk-ant-test' });
      expect(result.source).toBe('anthropic');
      expect(result.category).toBe('unknown');
      // Summary should fall back to the customer's text (truncated).
      expect(result.summary.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drops suggested_items whose catalog_id is unknown', async () => {
    const stubFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_3',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  category: 'roof',
                  summary: 'Roof reseal',
                  urgency: 'routine',
                  suggested_items: [
                    // Real item from the live catalog mirror — keep.
                    { catalog_id: 'inspection_fee', quantity: 1, reason: 'inspection per intake' },
                    // Fictitious id — drop.
                    { catalog_id: 'fictitious.item', quantity: 1 },
                  ],
                }),
              },
            ],
            model: 'claude-haiku-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 30 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', stubFetch);
    try {
      const result = await classifyIntake(baseRequest, { apiKey: 'sk-ant-test' });
      expect(result.suggested_items).toHaveLength(1);
      expect(result.suggested_items[0]?.catalog_id).toBe('inspection_fee');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
