import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  chatRequestSchema,
  chatResponseSchema,
} from '../../core/schemas/index.js';
import type { AppDependencies } from '../plugins/index.js';
import { ChatService } from '../../orchestrator/index.js';
import { metrics } from '../../observability/metrics.js';

export async function registerChatRoutes(app: FastifyInstance, deps: AppDependencies): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const chatService = new ChatService(deps.config, deps.logger);

  typed.post(
    '/chat',
    {
      schema: {
        body: chatRequestSchema,
        response: { 200: chatResponseSchema },
      },
    },
    async (request) => {
      const start = Date.now();
      const response = await chatService.chat(request.body);
      metrics.recordRequestLatency(Date.now() - start);
      metrics.recordTokens(response.tokenUsage.input, response.tokenUsage.output);
      return response;
    },
  );
}
