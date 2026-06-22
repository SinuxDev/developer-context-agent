import crypto from 'node:crypto';
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

    if (this.options.redis) {
      const cached = await this.options.redis.get(cacheKey);
      if (cached) {
        metrics.recordCacheHit('retrieval');
        return { ...JSON.parse(cached) as Omit<RetrievalResult, 'fromCache'>, fromCache: true };
      }
      metrics.recordCacheMiss('retrieval');
    }

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

    if (this.options.redis) {
      const ttl = this.options.cacheTtlSeconds ?? 3600;
      await this.options.redis.setex(cacheKey, ttl, JSON.stringify({
        files: result.files,
        symbols: result.symbols,
      }));
    }

    return result;
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
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const pattern = terms.join('|');
      if (!pattern) return scores;

      const { stdout } = await execFileAsync(
        'rg',
        ['--json', '-i', pattern, repoPath, '-g', '!node_modules'],
        { maxBuffer: 5 * 1024 * 1024 },
      ).catch((err: { code?: number; stdout?: string }) => {
        if (err.code === 1) return { stdout: '' };
        throw err;
      });

      for (const line of (stdout ?? '').split('\n').filter(Boolean)) {
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
