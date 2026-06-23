import type { AppConfig } from '../core/config.js';
import type { ModelAdapter } from './local-compressor.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { LocalCompressor } from './local-compressor.js';
import { parseProviderModel } from './provider-model.js';

export type ModelRole = 'planner' | 'executor' | 'reviewer' | 'compressor' | 'default';

export function createAdapter(
  config: AppConfig,
  modelRef: string,
): ModelAdapter | null {
  const { provider, model } = parseProviderModel(modelRef);

  if (provider === 'groq' && config.groqApiKey) {
    return new GroqAdapter(config.groqApiKey, model);
  }
  if (provider === 'openai' && config.openaiApiKey) {
    return new OpenAIAdapter(config.openaiApiKey, model);
  }
  if (provider === 'anthropic' && config.anthropicApiKey) {
    return new AnthropicAdapter(config.anthropicApiKey, model);
  }

  return null;
}

function resolveAdapter(
  config: AppConfig,
  modelRef: string,
  role: 'planner' | 'default' = 'default',
): ModelAdapter | null {
  const direct = createAdapter(config, modelRef);
  if (direct) return direct;

  const { provider, model } = parseProviderModel(modelRef);

  if (config.groqApiKey) {
    const groqModel =
      provider === 'groq'
        ? model
        : role === 'planner'
          ? 'llama-3.1-8b-instant'
          : 'llama-3.3-70b-versatile';
    return new GroqAdapter(config.groqApiKey, groqModel);
  }
  if (config.openaiApiKey) {
    const openaiModel = provider === 'openai' ? model : 'gpt-4o-mini';
    return new OpenAIAdapter(config.openaiApiKey, openaiModel);
  }
  if (config.anthropicApiKey) {
    const anthropicModel =
      provider === 'anthropic' ? model : 'claude-3-5-sonnet-20241022';
    return new AnthropicAdapter(config.anthropicApiKey, anthropicModel);
  }

  return null;
}

export class ModelRouter {
  private adapters = new Map<string, ModelAdapter>();
  private compressor: ModelAdapter;

  constructor(config: AppConfig) {
    const defaultAdapter = resolveAdapter(config, config.defaultModel, 'default');
    const plannerAdapter =
      resolveAdapter(config, config.plannerModel, 'planner') ?? defaultAdapter;

    if (defaultAdapter) {
      this.adapters.set('default', defaultAdapter);
      this.adapters.set('executor', defaultAdapter);
      this.adapters.set('reviewer', defaultAdapter);
    }

    if (plannerAdapter) {
      this.adapters.set('planner', plannerAdapter);
    }

    this.compressor = new LocalCompressor();
  }

  getAdapter(role: ModelRole = 'default'): ModelAdapter {
    const adapter = this.adapters.get(role) ?? this.adapters.get('default');
    if (!adapter) {
      return this.compressor;
    }
    return adapter;
  }

  getCompressor(): ModelAdapter {
    return this.compressor;
  }

  hasRemoteModel(): boolean {
    return this.adapters.size > 0;
  }
}
