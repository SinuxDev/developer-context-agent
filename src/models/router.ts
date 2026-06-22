import type { AppConfig } from '../core/config.js';
import type { ModelAdapter } from './local-compressor.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { LocalCompressor } from './local-compressor.js';
import { parseProviderModel } from './provider-model.js';

export type ModelRole = 'planner' | 'executor' | 'reviewer' | 'compressor' | 'default';

function createAdapter(
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

export class ModelRouter {
  private adapters = new Map<string, ModelAdapter>();
  private compressor: ModelAdapter;

  constructor(config: AppConfig) {
    const defaultAdapter = createAdapter(config, config.defaultModel);
    const plannerAdapter =
      createAdapter(config, config.plannerModel) ?? defaultAdapter;

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
