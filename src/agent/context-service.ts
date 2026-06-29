import fs from 'node:fs/promises';
import path from 'node:path';
import type { LocalConfig } from '../local/config.js';
import { loadLocalConfig, resolveRepoPath } from '../local/config.js';
import { LocalStore } from '../local/store.js';
import { HybridRetriever } from '../context/retriever.js';
import { PromptBuilder } from '../context/prompt-builder.js';
import { buildContextPackOutput, type ContextPackOutput } from '../context/context-pack-builder.js';
import { buildRepoMap } from '../context/repo-map.js';
import { buildSymbolIndex, searchSymbols } from '../context/symbol-index.js';
import { defaultTokenBudget } from '../context/token-budget.js';
import { RepoIndexer } from '../index/indexer.js';
import { OllamaEmbedder } from '../index/embedder.js';
import { createSandbox } from '../tools/sandbox.js';
import { runRipgrep } from '../tools/ripgrep.js';
import type { RetrievalResult } from '../context/retriever.js';
import type { SymbolEntry } from '../context/symbol-index.js';
import type { IndexMeta } from '../local/store.js';

export interface GetContextPackParams {
  task: string;
  repoPath?: string;
  maxTokens?: number;
  topKFiles?: number;
  autoIndex?: boolean;
}

export interface FindFilesParams {
  query: string;
  repoPath?: string;
  topK?: number;
}

export interface GrepParams {
  pattern: string;
  repoPath?: string;
  path?: string;
  maxMatches?: number;
}

export interface ReadFileParams {
  path: string;
  repoPath?: string;
  startLine?: number;
  endLine?: number;
}

export class ContextAgentService {
  private config: LocalConfig;

  constructor(config?: LocalConfig) {
    this.config = config ?? loadLocalConfig();
  }

  resolveRepo(repoPath?: string): string {
    const resolved = path.resolve(resolveRepoPath(repoPath));
    createSandbox(resolved, this.config);
    return resolved;
  }

  async indexRepo(repoPath?: string): Promise<Awaited<ReturnType<RepoIndexer['index']>>> {
    const resolved = this.resolveRepo(repoPath);
    const embedder = new OllamaEmbedder(this.config);
    const indexer = new RepoIndexer({ embedder });
    return indexer.index(resolved);
  }

  indexStatus(repoPath?: string): IndexMeta {
    const resolved = this.resolveRepo(repoPath);
    const store = new LocalStore(resolved);
    try {
      return store.getIndexMeta(resolved);
    } finally {
      store.close();
    }
  }

  async getContextPack(params: GetContextPackParams): Promise<ContextPackOutput> {
    const resolved = this.resolveRepo(params.repoPath);
    const maxTokens = params.maxTokens ?? this.config.tokenBudgetDefault;
    const topK = params.topKFiles ?? 10;

    if (params.autoIndex !== false) {
      await this.indexRepo(resolved).catch(() => undefined);
    }

    const hybrid = await this.retrieve(resolved, params.task, topK);
    const merged = await this.mergeVectorScores(resolved, params.task, hybrid, topK);

    const budget = defaultTokenBudget(maxTokens);
    const builder = new PromptBuilder({ tokenBudget: budget });
    const repoMap = await buildRepoMap(resolved);

    const contextPackage = await builder.buildContextPackage({
      repoMap,
      task: params.task,
      rankedFiles: merged.files.map((f) => ({ path: f.path, score: f.score })),
      symbols: merged.symbols,
    });

    return buildContextPackOutput(
      contextPackage,
      params.task,
      resolved,
      merged.files,
    );
  }

  async findFiles(params: FindFilesParams): Promise<RetrievalResult> {
    const resolved = this.resolveRepo(params.repoPath);
    const topK = params.topK ?? 10;
    const hybrid = await this.retrieve(resolved, params.query, topK);
    return this.mergeVectorScores(resolved, params.query, hybrid, topK);
  }

  async searchSymbols(query: string, repoPath?: string, maxResults = 20): Promise<SymbolEntry[]> {
    const resolved = this.resolveRepo(repoPath);
    const index = await buildSymbolIndex(resolved);
    return searchSymbols(index, query, maxResults);
  }

  async grep(params: GrepParams): Promise<{
    matches: Array<{ file: string; line: number; content: string }>;
    truncated: boolean;
  }> {
    const resolved = this.resolveRepo(params.repoPath);
    const sandbox = createSandbox(resolved, this.config);
    const searchPath = sandbox.resolve(params.path ?? '.');
    const maxMatches = params.maxMatches ?? 50;

    const args = ['--json', '-n', params.pattern, searchPath, '-g', '!node_modules'];
    const { stdout } = await runRipgrep(args);

    const matches: Array<{ file: string; line: number; content: string }> = [];
    for (const line of stdout.split('\n').filter(Boolean)) {
      if (matches.length >= maxMatches) break;
      try {
        const parsed = JSON.parse(line) as {
          type: string;
          data: { path: { text: string }; line_number: number; lines: { text: string } };
        };
        if (parsed.type === 'match') {
          matches.push({
            file: sandbox.toRelative(parsed.data.path.text),
            line: parsed.data.line_number,
            content: parsed.data.lines.text.trimEnd(),
          });
        }
      } catch {
        // skip malformed
      }
    }

    return { matches, truncated: matches.length >= maxMatches };
  }

  async readFile(params: ReadFileParams): Promise<{
    path: string;
    content: string;
    totalLines: number;
  }> {
    const resolved = this.resolveRepo(params.repoPath);
    const sandbox = createSandbox(resolved, this.config);
    const fullPath = sandbox.resolve(params.path);
    const raw = await fs.readFile(fullPath, 'utf8');
    const lines = raw.split('\n');

    if (params.startLine !== undefined || params.endLine !== undefined) {
      const start = Math.max(1, params.startLine ?? 1);
      const end = Math.min(lines.length, params.endLine ?? lines.length);
      const slice = lines.slice(start - 1, end).join('\n');
      return { path: params.path, content: slice, totalLines: lines.length };
    }

    return { path: params.path, content: raw, totalLines: lines.length };
  }

  private async retrieve(repoPath: string, query: string, topK: number): Promise<RetrievalResult> {
    const store = new LocalStore(repoPath);
    const retriever = new HybridRetriever({
      getCache: (key) => store.getCache(`retrieval:${key}`)?.value ?? null,
      setCache: (key, value, ttl) => store.setCache(`retrieval:${key}`, value, ttl),
      cacheTtlSeconds: 3600,
    });
    try {
      return await retriever.retrieve(repoPath, query, topK);
    } finally {
      store.close();
    }
  }

  private async mergeVectorScores(
    repoPath: string,
    query: string,
    hybrid: RetrievalResult,
    topK: number,
  ): Promise<RetrievalResult> {
    const store = new LocalStore(repoPath);
    try {
      const meta = store.getIndexMeta(repoPath);
      if (!meta.hasEmbeddings) return hybrid;

      const embedder = new OllamaEmbedder(this.config);
      await embedder.checkAvailability();
      if (!embedder.available) return hybrid;

      const queryEmbedding = await embedder.embed(query);
      if (!queryEmbedding) return hybrid;

      const vectorHits = store.vectorSearch(queryEmbedding, topK * 2);
      const fileScores = new Map<string, { score: number; reasons: string[] }>();

      for (const f of hybrid.files) {
        fileScores.set(f.path, { score: f.score, reasons: [...f.reasons] });
      }

      for (const hit of vectorHits) {
        const vectorScore = Math.round(hit.score * 100);
        const entry = fileScores.get(hit.filePath) ?? { score: 0, reasons: [] };
        entry.score += vectorScore;
        if (!entry.reasons.includes('vector match')) {
          entry.reasons.push('vector match');
        }
        fileScores.set(hit.filePath, entry);
      }

      const files = [...fileScores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, topK)
        .map(([filePath, { score, reasons }]) => ({ path: filePath, score, reasons }));

      return { ...hybrid, files, fromCache: hybrid.fromCache };
    } finally {
      store.close();
    }
  }
}
