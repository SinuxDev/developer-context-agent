import OpenAI from 'openai';
import type { ModelMessage, ModelResponse } from '../core/schemas/index.js';
import type { CompletionOptions, ModelAdapter } from './local-compressor.js';
import { countMessagesTokens } from '../context/token-budget.js';

export class OpenAIAdapter implements ModelAdapter {
  private client: OpenAI;
  id: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.id = `openai:${model}`;
  }

  async complete(messages: ModelMessage[], options?: CompletionOptions): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.id.replace('openai:', ''),
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.2,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? undefined,
      usage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? undefined,
    };
  }

  countTokens(messages: ModelMessage[]): number {
    return countMessagesTokens(messages);
  }
}
