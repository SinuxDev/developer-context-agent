import crypto from 'node:crypto';
import { runRipgrep } from '../tools/ripgrep.js';
import type { RedisClient } from '../db/redis.js';
import type { RepoMap } from './repo-map.js';
import type { SymbolIndex, SymbolEntry } from './symbol-index.js';
import { buildRepoMap } from './repo-map.js';
import { buildSymbolIndex, searchSymbols } from './symbol-index.js';
import { metrics } from '../observability/metrics.js';

export interface RetrievalResult {
  files: Array<{
    path: string;
    score: number;
    reasons: string[];
  }>;
  symbols: SymbolEntry[];
  fromCache: boolean;
}

export interface HybridRetrieverOptions {
  redis?: RedisClient;
  cacheTtlSeconds?: number;
  getCache?: (key: string) => string | null | Promise<string | null>;
  setCache?: (key: string, value: string, ttlSeconds?: number) => void | Promise<void>;
}

export class HybridRetriever {
  private repoMapCache = new Map<string, RepoMap>();
  private symbolIndexCache = new Map<string, SymbolIndex>();

  constructor(private readonly options: HybridRetrieverOptions = {}) {}

  async retrieve(
    repoPath: string,
    query: string,
    topK = 10,
  ): Promise<RetrievalResult> {
    const cacheKey = this.buildCacheKey(repoPath, query, topK);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      metrics.recordCacheHit('retrieval');
      return { ...JSON.parse(cached) as Omit<RetrievalResult, 'fromCache'>, fromCache: true };
    }
    metrics.recordCacheMiss('retrieval');

    const repoMap = await this.getRepoMap(repoPath);
    const symbolIndex = await this.getSymbolIndex(repoPath, repoMap.files.map((f) => f.path));

    const grepScores = await this.grepScore(repoPath, query, repoMap);
    const symbolMatches = searchSymbols(symbolIndex, query, topK * 2);
    const symbolFileScores = new Map<string, number>();
    for (const sym of symbolMatches) {
      symbolFileScores.set(sym.file, (symbolFileScores.get(sym.file) ?? 0) + 50);
    }

    const graphBoost = this.importGraphBoost(symbolIndex, symbolMatches.map((s) => s.file));

    const fileScores = new Map<string, { score: number; reasons: string[] }>();

    for (const [file, score] of grepScores) {
      const entry = fileScores.get(file) ?? { score: 0, reasons: [] };
      entry.score += score;
      entry.reasons.push('grep match');
      fileScores.set(file, entry);
    }

    for (const [file, score] of symbolFileScores) {
      const entry = fileScores.get(file) ?? { score: 0, reasons: [] };
      entry.score += score;
      entry.reasons.push('symbol match');
      fileScores.set(file, entry);
    }

    for (const [file, boost] of graphBoost) {
      const entry = fileScores.get(file) ?? { score: 0, reasons: [] };
      entry.score += boost;
      entry.reasons.push('import neighbor');
      fileScores.set(file, entry);
    }

    for (const f of repoMap.files) {
      if (f.path.toLowerCase().includes(query.toLowerCase().split(' ')[0] ?? '')) {
        const entry = fileScores.get(f.path) ?? { score: 0, reasons: [] };
        entry.score += 15;
        entry.reasons.push('path heuristic');
        fileScores.set(f.path, entry);
      }
    }

    const files = [...fileScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK)
      .map(([path, { score, reasons }]) => ({ path, score, reasons }));

    const result: RetrievalResult = {
      files,
      symbols: symbolMatches.slice(0, topK),
      fromCache: false,
    };

    await this.writeCache(cacheKey, JSON.stringify({
      files: result.files,
      symbols: result.symbols,
    }));

    return result;
  }

  private async readCache(key: string): Promise<string | null> {
    if (this.options.getCache) {
      return (await this.options.getCache(key)) ?? null;
    }
    if (this.options.redis) {
      return (await this.options.redis.get(key)) ?? null;
    }
    return null;
  }

  private async writeCache(key: string, value: string): Promise<void> {
    const ttl = this.options.cacheTtlSeconds ?? 3600;
    if (this.options.setCache) {
      await this.options.setCache(key, value, ttl);
      return;
    }
    if (this.options.redis) {
      await this.options.redis.setex(key, ttl, value);
    }
  }

  private buildCacheKey(repoPath: string, query: string, topK: number): string {
    const hash = crypto.createHash('sha256').update(`${repoPath}:${query}:${topK}`).digest('hex');
    return `retrieval:${hash}`;
  }

  private async getRepoMap(repoPath: string): Promise<RepoMap> {
    const cached = this.repoMapCache.get(repoPath);
    if (cached) return cached;
    const map = await buildRepoMap(repoPath);
    this.repoMapCache.set(repoPath, map);
    return map;
  }

  private async getSymbolIndex(repoPath: string, files: string[]): Promise<SymbolIndex> {
    const cached = this.symbolIndexCache.get(repoPath);
    if (cached) return cached;
    const index = await buildSymbolIndex(repoPath, files.filter((f) => /\.(ts|tsx)$/.test(f)));
    this.symbolIndexCache.set(repoPath, index);
    return index;
  }

  private async grepScore(
    repoPath: string,
    query: string,
    repoMap: RepoMap,
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    for (const file of repoMap.files) {
      if (!/\.(ts|tsx|js|jsx|md)$/.test(file.path)) continue;
      let score = 0;
      for (const term of terms) {
        if (file.path.toLowerCase().includes(term)) score += 10;
      }
      if (score > 0) scores.set(file.path, score);
    }

    try {
      const pattern = terms.join('|');
      if (!pattern) return scores;

      const { stdout } = await runRipgrep(
        ['--json', '-i', pattern, repoPath, '-g', '!node_modules'],
      );

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line) as {
            type: string;
            data: { path: { text: string } };
          };
          if (parsed.type === 'match') {
            const rel = parsed.data.path.text.replace(repoPath, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
            scores.set(rel, (scores.get(rel) ?? 0) + 25);
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // ripgrep not available, use path heuristics only
    }

    return scores;
  }

  private importGraphBoost(index: SymbolIndex, seedFiles: string[]): Map<string, number> {
    const boost = new Map<string, number>();
    const seeds = new Set(seedFiles);

    for (const [file, imports] of index.importGraph) {
      if (seeds.has(file)) {
        for (const imp of imports) {
          const neighbor = resolveImport(imp, index);
          if (neighbor && !seeds.has(neighbor)) {
            boost.set(neighbor, (boost.get(neighbor) ?? 0) + 15);
          }
        }
      }
    }

    return boost;
  }
}

function resolveImport(spec: string, index: SymbolIndex): string | undefined {
  if (spec.startsWith('.')) {
    return undefined;
  }
  for (const [file] of index.fileIndex) {
    if (file.includes(spec.replace(/^\.\//, ''))) return file;
  }
  return undefined;
}
