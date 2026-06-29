import { describe, it, expect } from 'vitest';
import { ContextAgentService } from '../../src/agent/context-service.js';
import { buildContextPackMarkdown } from '../../src/context/context-pack-builder.js';
import { defaultTokenBudget } from '../../src/context/token-budget.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-ts-app',
);

describe('ContextAgentService', () => {
  const service = new ContextAgentService({
    allowedRepoRoots: [],
    tokenBudgetDefault: 4000,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaEmbedModel: 'nomic-embed-text',
    logLevel: 'error',
  });

  it('builds a context pack for a fixture repo', async () => {
    const pack = await service.getContextPack({
      task: 'auth middleware',
      repoPath: fixturePath,
      topKFiles: 5,
      autoIndex: true,
    });

    expect(pack.files.length).toBeGreaterThan(0);
    expect(pack.markdown).toContain('auth');
    expect(pack.tokenCount).toBeGreaterThan(0);
  });

  it('finds files for auth query', async () => {
    const result = await service.findFiles({
      query: 'auth middleware',
      repoPath: fixturePath,
      topK: 5,
    });
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('reports index status', async () => {
    await service.indexRepo(fixturePath);
    const status = service.indexStatus(fixturePath);
    expect(status.chunkCount).toBeGreaterThan(0);
  });
});

describe('context-pack-builder', () => {
  it('renders markdown with token estimate', () => {
    const budget = defaultTokenBudget(4000);
    const md = buildContextPackMarkdown(
      {
        systemPrefix: '',
        repoSummary: 'Sample app',
        files: [{ path: 'src/auth.ts', excerpt: 'export function auth() {}', score: 90, symbols: [] }],
        symbols: [{ name: 'auth', kind: 'FunctionDeclaration', file: 'src/auth.ts', line: 1 }],
        estimatedTokens: budget.total,
      },
      'explain auth',
    );
    expect(md).toContain('Sample app');
    expect(md).toContain('src/auth.ts');
  });
});
