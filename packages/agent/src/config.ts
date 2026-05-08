/**
 * Phase 00 stub: model selection and config contract for the Anthropic agent layer.
 * Full SDK wrapper, tool-use loop, and streaming protocol land in Phase 02/04.
 */

export type ModelTier = 'default' | 'fast';

export interface AgentConfig {
  apiKey: string;
  modelDefault: string;
  modelFast: string;
}

/**
 * Pick a model id for a given tier. Centralised so swapping defaults is one edit.
 * Defaults match planning/03-tech-stack.md (Sonnet 4.6 / Haiku 4.5).
 */
export function selectModel(config: AgentConfig, tier: ModelTier): string {
  return tier === 'fast' ? config.modelFast : config.modelDefault;
}
