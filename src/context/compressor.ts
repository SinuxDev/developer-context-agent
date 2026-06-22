import crypto from 'node:crypto';
import type { RedisClient } from '../db/redis.js';
import { countTokens, truncateToTokenBudget } from './token-budget.js';
import { metrics } from '../observability/metrics.js';

export interface CompressorOptions {
  redis?: RedisClient;
  cacheTtlSeconds?: number;
}

export class HistoryCompressor {
  constructor(private readonly options: CompressorOptions = {}) {}

  async compressToolOutput(toolName: string, output: string, maxTokens = 500): Promise<string> {
    const cacheKey = this.contentKey(`tool:${toolName}`, output);

    if (this.options.redis) {
      const cached = await this.options.redis.get(cacheKey);
      if (cached) {
        metrics.recordCacheHit('summary');
        return cached;
      }
      metrics.recordCacheMiss('summary');
    }

    let summary: string;
    if (countTokens(output) <= maxTokens) {
      summary = output;
    } else {
      summary = truncateToTokenBudget(output, maxTokens);
    }

    if (this.options.redis) {
      const ttl = this.options.cacheTtlSeconds ?? 3600;
      await this.options.redis.setex(cacheKey, ttl, summary);
    }

    return summary;
  }

  async compressHistory(entries: string[], maxTokens = 1000): Promise<string> {
    const combined = entries.join('\n---\n');
    if (countTokens(combined) <= maxTokens) return combined;

    const keepRecent = entries.slice(-3);
    const older = entries.slice(0, -3);
    const olderSummary = older.length
      ? `[${older.length} earlier steps summarized]: ${truncateToTokenBudget(older.join(' '), Math.floor(maxTokens / 2))}`
      : '';

    const recent = keepRecent.join('\n---\n');
    return truncateToTokenBudget(
      olderSummary ? `${olderSummary}\n---\n${recent}` : recent,
      maxTokens,
    );
  }

  private contentKey(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    return `summary:${prefix}:${hash}`;
  }
}
