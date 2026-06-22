import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../core/config.js';

export async function registerAuthHook(app: FastifyInstance, config: AppConfig): Promise<void> {
  if (!config.apiKey) return;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/health') return;

    const key = request.headers['x-api-key'];
    if (key !== config.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
