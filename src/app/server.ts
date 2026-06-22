import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from '../core/config.js';
import type { Database } from '../db/client.js';
import type { RedisClient } from '../db/redis.js';
import type { Logger } from '../observability/logger.js';
import type { MetricsRegistry } from '../observability/metrics.js';
import { registerRoutes, type AppDependencies } from './plugins/index.js';

export interface CreateServerOptions {
  config: AppConfig;
  db: Database;
  redis: RedisClient;
  logger: Logger;
  metrics: MetricsRegistry;
}

export async function createServer(options: CreateServerOptions) {
  const app = Fastify({
    logger: options.logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    options.logger.error({ err: error }, 'Request error');
    return reply.status(statusCode).send({
      error: error.message,
      statusCode,
    });
  });

  const deps: AppDependencies = {
    config: options.config,
    db: options.db,
    redis: options.redis,
    logger: options.logger,
    metrics: options.metrics,
  };

  await registerRoutes(app, deps);

  return app;
}

export async function startServer(options: CreateServerOptions) {
  const app = await createServer(options);
  await app.listen({ port: options.config.port, host: '0.0.0.0' });
  options.logger.info({ port: options.config.port }, 'Server started');
  return app;
}
