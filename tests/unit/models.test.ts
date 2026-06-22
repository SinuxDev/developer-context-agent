import { describe, it, expect } from 'vitest';
import { parseProviderModel } from '../../src/models/provider-model.js';
import { ModelRouter } from '../../src/models/router.js';

describe('parseProviderModel', () => {
  it('parses provider:model refs', () => {
    expect(parseProviderModel('groq:llama-3.3-70b-versatile')).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
  });

  it('uses fallback provider when no prefix', () => {
    expect(parseProviderModel('gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });
});

describe('ModelRouter', () => {
  it('registers Groq adapter when groq key and model prefix are set', () => {
    const router = new ModelRouter({
      port: 3100,
      databaseUrl: 'postgres://localhost/db',
      redisUrl: 'redis://localhost',
      groqApiKey: 'test-key',
      defaultModel: 'groq:llama-3.3-70b-versatile',
      plannerModel: 'groq:llama-3.1-8b-instant',
      allowedRepoRoots: [],
      tokenBudgetDefault: 32000,
      logLevel: 'info',
      nodeEnv: 'test',
    });

    expect(router.hasRemoteModel()).toBe(true);
    expect(router.getAdapter('default').id).toBe('groq:llama-3.3-70b-versatile');
    expect(router.getAdapter('planner').id).toBe('groq:llama-3.1-8b-instant');
  });
});
