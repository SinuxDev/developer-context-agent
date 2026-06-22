import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  taskRequestSchema,
  runStateSchema,
  approveRequestSchema,
} from '../../core/schemas/index.js';
import type { AppDependencies } from '../plugins/index.js';
import { RunStore, Orchestrator } from '../../orchestrator/index.js';
import { metrics } from '../../observability/metrics.js';

export async function registerRunRoutes(app: FastifyInstance, deps: AppDependencies): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const runStore = new RunStore(deps.db, deps.redis);
  const orchestrator = new Orchestrator(deps.config, runStore, deps.logger, deps.redis);

  typed.post(
    '/runs',
    {
      schema: {
        body: taskRequestSchema,
        response: { 201: runStateSchema },
      },
    },
    async (request, reply) => {
      const start = Date.now();
      metrics.recordRunStarted();

      try {
        const state = await orchestrator.startRun(request.body);
        metrics.recordRequestLatency(Date.now() - start);
        return reply.status(201).send(state);
      } catch (err) {
        metrics.recordRunFailed();
        metrics.recordRequestLatency(Date.now() - start);
        throw err;
      }
    },
  );

  typed.get(
    '/runs/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: runStateSchema },
      },
    },
    async (request) => {
      const state = await runStore.getRun(request.params.id);
      if (!state) {
        const err = new Error('Run not found') as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
      return state;
    },
  );

  typed.post(
    '/runs/:id/approve',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: approveRequestSchema,
        response: { 200: runStateSchema },
      },
    },
    async (request) => {
      const state = await orchestrator.approve(
        request.params.id,
        request.body,
      );
      return state;
    },
  );
}
