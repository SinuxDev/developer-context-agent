import { Redis } from 'ioredis';

export type RedisClient = Redis;

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: () => null,
  });
}

export async function connectRedis(redis: Redis): Promise<void> {
  const errorHandler = (err: Error) => {
    throw new Error(
      `Redis connection failed (${redis.options.host ?? 'localhost'}:${redis.options.port ?? 6379}). ` +
        'Start infrastructure with: npm run docker:up',
      { cause: err },
    );
  };

  redis.once('error', errorHandler);

  try {
    await redis.connect();
    await redis.ping();
    redis.off('error', errorHandler);
  } catch (err) {
    redis.disconnect();
    if (err instanceof Error && err.message.includes('Redis connection failed')) {
      throw err;
    }
    throw new Error(
      'Redis is not reachable. Start Docker Desktop, then run: npm run docker:up && npm run db:migrate',
      { cause: err },
    );
  }
}

export async function checkRedisConnection(redis: Redis): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
