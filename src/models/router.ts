import type { AppConfig } from '../core/config.js';
import type { ModelAdapter } from './local-compressor.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { LocalCompressor } from './local-compressor.js';

export type ModelRole = 'planner' | 'executor' | 'reviewer' | 'compressor' | 'default';

export class ModelRouter {
  private adapters = new Map<string, ModelAdapter>();
  private compressor: ModelAdapter;

  constructor(config: AppConfig) {
    if (config.openaiApiKey) {
      const defaultModel = config.defaultModel.replace('openai:', '');
      const plannerModel = config.plannerModel.replace('openai:', '');
      this.adapters.set('default', new OpenAIAdapter(config.openaiApiKey, defaultModel));
      this.adapters.set('planner', new OpenAIAdapter(config.openaiApiKey, plannerModel));
      this.adapters.set('executor', new OpenAIAdapter(config.openaiApiKey, defaultModel));
      this.adapters.set('reviewer', new OpenAIAdapter(config.openaiApiKey, defaultModel));
    }

    if (config.anthropicApiKey) {
      const model = config.defaultModel.replace('anthropic:', '') || 'claude-3-5-sonnet-20241022';
      this.adapters.set('anthropic', new AnthropicAdapter(config.anthropicApiKey, model));
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
