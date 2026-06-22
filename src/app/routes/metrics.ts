import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../plugins/index.js';

const metricsResponseSchema = z.object({
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  cache: z.object({
    prefixHits: z.number(),
    prefixMisses: z.number(),
    retrievalHits: z.number(),
    retrievalMisses: z.number(),
    summaryHits: z.number(),
    summaryMisses: z.number(),
  }),
  runs: z.object({
    started: z.number(),
    completed: z.number(),
    failed: z.number(),
  }),
  latency: z.object({
    requestCount: z.number(),
    totalMs: z.number(),
    avgMs: z.number(),
  }),
  cost: z.object({
    estimatedUsd: z.number(),
  }),
});

export async function registerMetricsRoutes(app: FastifyInstance, deps: AppDependencies): Promise<void> {
  app.get('/metrics', {
    schema: { response: { 200: metricsResponseSchema } },
  }, async () => {
    return deps.metrics.snapshot();
  });
}
