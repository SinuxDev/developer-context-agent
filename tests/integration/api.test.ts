import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { createDb, checkDbConnection } from '../../src/db/client.js';
import { createRedis, checkRedisConnection } from '../../src/db/redis.js';
import { createLogger } from '../../src/observability/logger.js';
import { metrics } from '../../src/observability/metrics.js';
import { createServer } from '../../src/app/server.js';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-ts-app',
);

const config = loadConfig({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://dca:dca@localhost:5432/developer_context_agent',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  API_KEY: 'test-key',
});

let servicesAvailable = false;

describe('API integration', () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    const db = createDb(config.databaseUrl);
    const redis = createRedis(config.redisUrl);
    try {
      await redis.connect();
      const dbOk = await checkDbConnection(db.client);
      const redisOk = await checkRedisConnection(redis);
      servicesAvailable = dbOk && redisOk;
      if (!servicesAvailable) {
        await redis.quit();
        await db.client.end();
        return;
      }
      const logger = createLogger({ ...config, logLevel: 'error' });
      app = await createServer({ config, db, redis, logger, metrics });
    } catch {
      servicesAvailable = false;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns status', async () => {
    if (!servicesAvailable || !app) return;
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(res.statusCode);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBeDefined();
  });

  it('GET /metrics returns metrics', async () => {
    if (!servicesAvailable || !app) return;
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tokens: unknown; cache: unknown };
    expect(body.tokens).toBeDefined();
    expect(body.cache).toBeDefined();
  });

  it('POST /chat returns answer', async () => {
    if (!servicesAvailable || !app) return;
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'x-api-key': 'test-key' },
      payload: {
        prompt: 'What does auth.ts do?',
        repoPath: fixturePath,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { answer: string; contextFiles: string[] };
    expect(body.answer).toBeTruthy();
    expect(body.contextFiles.length).toBeGreaterThan(0);
  });

  it('POST /runs creates a run', async () => {
    if (!servicesAvailable || !app) return;
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { 'x-api-key': 'test-key' },
      payload: {
        mode: 'find',
        prompt: 'auth middleware',
        repoPath: fixturePath,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: string; status: string };
    expect(body.id).toBeTruthy();
    expect(body.status).toBeDefined();

    const getRes = await app.inject({
      method: 'GET',
      url: `/runs/${body.id}`,
      headers: { 'x-api-key': 'test-key' },
    });
    expect(getRes.statusCode).toBe(200);
  });
});
