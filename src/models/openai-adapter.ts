import OpenAI from 'openai';
import type { ModelMessage, ModelResponse } from '../core/schemas/index.js';
import type { CompletionOptions, ModelAdapter } from './local-compressor.js';
import { countMessagesTokens } from '../context/token-budget.js';

export interface OpenAICompatibleOptions {
  apiKey: string;
  model: string;
  providerId?: string;
  baseURL?: string;
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  private client: OpenAI;
  private model: string;
  id: string;

  constructor(options: OpenAICompatibleOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.model = options.model;
    this.id = `${options.providerId ?? 'openai'}:${options.model}`;
  }

  async complete(messages: ModelMessage[], options?: CompletionOptions): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
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

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, model: string) {
    super({ apiKey, model, providerId: 'openai' });
  }
}
