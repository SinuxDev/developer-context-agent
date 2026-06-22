import type { ModelMessage, ModelResponse, TokenUsage } from '../core/schemas/index.js';
import { countMessagesTokens } from '../context/token-budget.js';

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ModelAdapter {
  id: string;
  complete(messages: ModelMessage[], options?: CompletionOptions): Promise<ModelResponse>;
  countTokens(messages: ModelMessage[]): number;
}

export class LocalCompressor implements ModelAdapter {
  id = 'local:compressor';

  async complete(messages: ModelMessage[], _options?: CompletionOptions): Promise<ModelResponse> {
    const content = messages.map((m) => m.content).join('\n');
    const words = content.split(/\s+/);
    const summary = words.length > 100 ? words.slice(0, 100).join(' ') + '...' : content;
    return {
      content: summary,
      usage: { input: this.countTokens(messages), output: 20, total: this.countTokens(messages) + 20 },
      finishReason: 'stop',
    };
  }

  countTokens(messages: ModelMessage[]): number {
    return countMessagesTokens(messages);
  }
}
