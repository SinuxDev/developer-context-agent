import type { RedisClient } from '../db/redis.js';
import crypto from 'node:crypto';
import { metrics } from '../observability/metrics.js';

export class PrefixCache {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds = 86400,
  ) {}

  private key(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `prefix:${hash}`;
  }

  async get(content: string): Promise<string | null> {
    const cached = await this.redis.get(this.key(content));
    if (cached) metrics.recordCacheHit('prefix');
    else metrics.recordCacheMiss('prefix');
    return cached;
  }

  async set(content: string, value: string): Promise<void> {
    await this.redis.setex(this.key(content), this.ttlSeconds, value);
  }
}
