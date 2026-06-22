import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client.js';
import type { RedisClient } from '../../db/redis.js';
import type { AppConfig } from '../../core/config.js';
import type { Logger } from '../../observability/logger.js';
import type { MetricsRegistry } from '../../observability/metrics.js';
import { registerAuthHook } from './auth.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerRunRoutes } from '../routes/runs.js';
import { registerChatRoutes } from '../routes/chat.js';
import { registerMetricsRoutes } from '../routes/metrics.js';

export interface AppDependencies {
  config: AppConfig;
  db: Database;
  redis: RedisClient;
  logger: Logger;
  metrics: MetricsRegistry;
}

export async function registerRoutes(app: FastifyInstance, deps: AppDependencies): Promise<void> {
  await registerAuthHook(app, deps.config);
  await registerHealthRoutes(app, deps);
  await registerRunRoutes(app, deps);
  await registerChatRoutes(app, deps);
  await registerMetricsRoutes(app, deps);
}
