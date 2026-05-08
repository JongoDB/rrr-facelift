import { describe, expect, it } from 'vitest';
import { type AgentConfig, selectModel } from './config.js';

const config: AgentConfig = {
  apiKey: 'sk-ant-test',
  modelDefault: 'claude-sonnet-4-6',
  modelFast: 'claude-haiku-4-5',
};

describe('agent model selection', () => {
  it('returns the default model when tier is "default"', () => {
    expect(selectModel(config, 'default')).toBe('claude-sonnet-4-6');
  });

  it('returns the fast model when tier is "fast"', () => {
    expect(selectModel(config, 'fast')).toBe('claude-haiku-4-5');
  });
});
