import './core/load-env.js';
import { loadConfig } from './core/config.js';
import { createDb, checkDbConnection } from './db/client.js';
import { createRedis, connectRedis } from './db/redis.js';
import { createLogger } from './observability/logger.js';
import { metrics } from './observability/metrics.js';
import { startServer } from './app/server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDb(config.databaseUrl);
  const redis = createRedis(config.redisUrl);

  await connectRedis(redis);

  const dbOk = await checkDbConnection(database.client);
  if (!dbOk) {
    await redis.quit();
    await database.client.end();
    throw new Error(
      'Postgres is not reachable. Start Docker Desktop, then run: npm run docker:up && npm run db:migrate',
    );
  }

  const app = await startServer({ config, db: database, redis, logger, metrics });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    await redis.quit();
    await database.client.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.cause) {
    console.error('Cause:', err.cause);
  }
  process.exit(1);
});
