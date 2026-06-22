import { OpenAICompatibleAdapter } from './openai-adapter.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, model: string) {
    super({
      apiKey,
      model,
      providerId: 'groq',
      baseURL: GROQ_BASE_URL,
    });
  }
}
