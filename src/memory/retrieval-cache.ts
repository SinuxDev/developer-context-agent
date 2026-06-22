import type { RedisClient } from '../db/redis.js';
import crypto from 'node:crypto';
import { metrics } from '../observability/metrics.js';
import type { RetrievalResult } from '../context/retriever.js';

export class RetrievalCache {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds = 3600,
  ) {}

  private key(repoPath: string, query: string, topK: number): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${repoPath}:${query}:${topK}`)
      .digest('hex');
    return `retrieval:${hash}`;
  }

  async get(repoPath: string, query: string, topK: number): Promise<Omit<RetrievalResult, 'fromCache'> | null> {
    const cached = await this.redis.get(this.key(repoPath, query, topK));
    if (cached) {
      metrics.recordCacheHit('retrieval');
      return JSON.parse(cached) as Omit<RetrievalResult, 'fromCache'>;
    }
    metrics.recordCacheMiss('retrieval');
    return null;
  }

  async set(
    repoPath: string,
    query: string,
    topK: number,
    result: Omit<RetrievalResult, 'fromCache'>,
  ): Promise<void> {
    await this.redis.setex(
      this.key(repoPath, query, topK),
      this.ttlSeconds,
      JSON.stringify({ files: result.files, symbols: result.symbols }),
    );
  }
}
