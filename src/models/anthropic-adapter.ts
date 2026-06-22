import type { ModelMessage, ModelResponse } from '../core/schemas/index.js';
import type { CompletionOptions, ModelAdapter } from './local-compressor.js';
import { countMessagesTokens } from '../context/token-budget.js';

export class AnthropicAdapter implements ModelAdapter {
  id: string;

  constructor(
    private readonly apiKey: string,
    model: string,
  ) {
    this.id = `anthropic:${model}`;
  }

  async complete(messages: ModelMessage[], options?: CompletionOptions): Promise<ModelResponse> {
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const model = this.id.replace('anthropic:', '');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 4096,
        system,
        messages: chatMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content.find((c) => c.type === 'text')?.text ?? '';
    return {
      content: text,
      usage: {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
        total: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: 'stop',
    };
  }

  countTokens(messages: ModelMessage[]): number {
    return countMessagesTokens(messages);
  }
}
