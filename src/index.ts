import { loadConfig } from './core/config.js';
import { createDb } from './db/client.js';
import { createRedis } from './db/redis.js';
import { createLogger } from './observability/logger.js';
import { metrics } from './observability/metrics.js';
import { startServer } from './app/server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDb(config.databaseUrl);
  const redis = createRedis(config.redisUrl);

  await redis.connect();

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
  console.error('Failed to start:', err);
  process.exit(1);
});
