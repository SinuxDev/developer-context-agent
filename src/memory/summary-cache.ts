import type { RedisClient } from '../db/redis.js';
import crypto from 'node:crypto';
import { metrics } from '../observability/metrics.js';

export class SummaryCache {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds = 3600,
  ) {}

  private key(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    return `summary:${prefix}:${hash}`;
  }

  async get(prefix: string, content: string): Promise<string | null> {
    const cached = await this.redis.get(this.key(prefix, content));
    if (cached) metrics.recordCacheHit('summary');
    else metrics.recordCacheMiss('summary');
    return cached;
  }

  async set(prefix: string, content: string, summary: string): Promise<void> {
    await this.redis.setex(this.key(prefix, content), this.ttlSeconds, summary);
  }
}
