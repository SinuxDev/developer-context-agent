import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from '../../src/orchestrator/state-machine.js';
import { countTokens, truncateToTokenBudget, defaultTokenBudget } from '../../src/context/token-budget.js';
import { buildRepoMap } from '../../src/context/repo-map.js';
import { buildSymbolIndex, searchSymbols } from '../../src/context/symbol-index.js';
import { HybridRetriever } from '../../src/context/retriever.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-ts-app',
);

describe('state-machine', () => {
  it('allows valid transitions', () => {
    expect(canTransition('pending', 'planning')).toBe(true);
    expect(canTransition('executing', 'awaiting_approval')).toBe(true);
    expect(canTransition('completed', 'failed')).toBe(false);
  });

  it('asserts invalid transitions', () => {
    expect(() => assertTransition('completed', 'executing')).toThrow();
  });
});

describe('token-budget', () => {
  it('counts tokens', () => {
    const count = countTokens('hello world');
    expect(count).toBeGreaterThan(0);
  });

  it('truncates to budget', () => {
    const long = 'word '.repeat(1000);
    const truncated = truncateToTokenBudget(long, 50);
    expect(countTokens(truncated)).toBeLessThanOrEqual(60);
  });

  it('creates default budget', () => {
    const budget = defaultTokenBudget(32000);
    expect(budget.total).toBe(32000);
  });
});

describe('repo-map', () => {
  it('builds repo map for fixture', async () => {
    const map = await buildRepoMap(fixturePath);
    expect(map.packageName).toBe('sample-ts-app');
    expect(map.files.length).toBeGreaterThan(0);
  });
});

describe('symbol-index', () => {
  it('indexes and searches symbols', async () => {
    const index = await buildSymbolIndex(fixturePath);
    const results = searchSymbols(index, 'authMiddleware');
    expect(results.some((s) => s.name === 'authMiddleware')).toBe(true);
  });
});

describe('retriever', () => {
  it('retrieves relevant files for auth query', async () => {
    const retriever = new HybridRetriever();
    const result = await retriever.retrieve(fixturePath, 'auth middleware bug', 5);
    expect(result.files.length).toBeGreaterThan(0);
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('middleware') || p.includes('auth'))).toBe(true);
  });
});
