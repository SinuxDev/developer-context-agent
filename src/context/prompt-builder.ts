import type { ContextPackage } from '../core/schemas/index.js';
import type { RepoMap } from './repo-map.js';
import { summarizeRepoMap } from './repo-map.js';
import type { SymbolEntry } from './symbol-index.js';
import type { TokenBudgetConfig } from './token-budget.js';
import { countTokens, defaultTokenBudget, truncateToTokenBudget } from './token-budget.js';
import type { ToolRegistry } from '../tools/registry.js';
import { metrics } from '../observability/metrics.js';
import type { RedisClient } from '../db/redis.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SYSTEM_INSTRUCTIONS = `You are Developer Context Agent, a codebase-aware assistant for TypeScript/Node.js projects.
Focus on precise, token-efficient answers. Reference specific files and symbols.
Prefer minimal, actionable guidance over verbose explanations.`;

export interface PromptBuilderOptions {
  redis?: RedisClient;
  toolRegistry?: ToolRegistry;
  tokenBudget?: TokenBudgetConfig;
}

export class PromptBuilder {
  private budget: TokenBudgetConfig;

  constructor(private readonly options: PromptBuilderOptions = {}) {
    this.budget = options.tokenBudget ?? defaultTokenBudget();
  }

  async buildContextPackage(params: {
    repoMap: RepoMap;
    task: string;
    rankedFiles: Array<{ path: string; score: number }>;
    symbols: SymbolEntry[];
    compressedHistory?: string;
  }): Promise<ContextPackage> {
    const toolDescriptions = this.options.toolRegistry
      ? JSON.stringify(this.options.toolRegistry.getDescriptions(), null, 2)
      : '[]';

    const prefixKey = crypto
      .createHash('sha256')
      .update(SYSTEM_INSTRUCTIONS + toolDescriptions)
      .digest('hex');

    let systemPrefix = `${SYSTEM_INSTRUCTIONS}\n\n## Tools\n${toolDescriptions}`;

    if (this.options.redis) {
      const cached = await this.options.redis.get(`prefix:${prefixKey}`);
      if (cached) {
        metrics.recordCacheHit('prefix');
        systemPrefix = cached;
      } else {
        metrics.recordCacheMiss('prefix');
        await this.options.redis.setex(`prefix:${prefixKey}`, 86400, systemPrefix);
      }
    }

    const repoSummary = truncateToTokenBudget(
      summarizeRepoMap(params.repoMap),
      this.budget.repoSummary,
    );

    const files = await this.loadFileExcerpts(
      params.repoMap.repoPath,
      params.rankedFiles,
      this.budget.files,
    );

    const userTask = truncateToTokenBudget(params.task, this.budget.userTask);
    const compressedHistory = params.compressedHistory
      ? truncateToTokenBudget(params.compressedHistory, this.budget.history)
      : undefined;

    const estimatedTokens =
      countTokens(systemPrefix) +
      countTokens(repoSummary) +
      files.reduce((s, f) => s + countTokens(f.excerpt), 0) +
      countTokens(userTask) +
      (compressedHistory ? countTokens(compressedHistory) : 0);

    return {
      systemPrefix,
      repoSummary,
      files,
      symbols: params.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        file: s.file,
        line: s.line,
      })),
      compressedHistory,
      estimatedTokens,
    };
  }

  buildMessages(pkg: ContextPackage, task: string): Array<{ role: 'system' | 'user'; content: string }> {
    const fileBlock = pkg.files
      .map((f) => `### ${f.path} (score: ${f.score})\n${f.excerpt}`)
      .join('\n\n');

    const symbolBlock = pkg.symbols.length
      ? `## Symbols\n${pkg.symbols.map((s) => `- ${s.name} (${s.kind}) in ${s.file}`).join('\n')}`
      : '';

    const dynamic = [
      `## Repository\n${pkg.repoSummary}`,
      symbolBlock,
      `## Relevant Files\n${fileBlock}`,
      pkg.compressedHistory ? `## History\n${pkg.compressedHistory}` : '',
      `## Task\n${task}`,
    ].filter(Boolean).join('\n\n');

    return [
      { role: 'system', content: pkg.systemPrefix },
      { role: 'user', content: dynamic },
    ];
  }

  private async loadFileExcerpts(
    repoPath: string,
    rankedFiles: Array<{ path: string; score: number }>,
    maxTokens: number,
  ): Promise<ContextPackage['files']> {
    const results: ContextPackage['files'] = [];
    let usedTokens = 0;
    const perFileBudget = Math.floor(maxTokens / Math.max(rankedFiles.length, 1));

    for (const { path: filePath, score } of rankedFiles) {
      if (usedTokens >= maxTokens) break;
      try {
        const full = path.join(repoPath, filePath);
        const content = await fs.readFile(full, 'utf8');
        const excerpt = truncateToTokenBudget(content, perFileBudget);
        const tokens = countTokens(excerpt);
        usedTokens += tokens;
        results.push({ path: filePath, excerpt, score, symbols: [] });
      } catch {
        // skip unreadable files
      }
    }

    return results;
  }
}
