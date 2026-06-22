import type { FastifyInstance } from 'fastify';
import { checkDbConnection } from '../../db/client.js';
import { checkRedisConnection } from '../../db/redis.js';
import type { AppDependencies } from '../plugins/index.js';

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDependencies): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const dbOk = await checkDbConnection(deps.db.client);
    const redisOk = await checkRedisConnection(deps.redis);

    const healthy = dbOk && redisOk;
    const status = healthy ? 200 : 503;

    return reply.status(status).send({
      status: healthy ? 'ok' : 'degraded',
      checks: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    });
  });
}
