import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../core/config.js';
import { createDb } from '../db/client.js';
import { createRedis } from '../db/redis.js';
import { createLogger } from '../observability/logger.js';
import { RunStore } from '../orchestrator/run-store.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { ChatService } from '../orchestrator/chat-service.js';
import { HybridRetriever } from '../context/retriever.js';

export async function startMcpServer(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDb(config.databaseUrl);
  const redis = createRedis(config.redisUrl);
  await redis.connect();

  const runStore = new RunStore(db, redis);
  const orchestrator = new Orchestrator(config, runStore, logger, redis);
  const chatService = new ChatService(config, logger);
  const retriever = new HybridRetriever({ redis });

  const server = new McpServer({
    name: 'developer-context-agent',
    version: '0.1.0',
  });

  server.tool(
    'start_run',
    'Start a new agent run for a coding task',
    {
      mode: z.enum(['explain', 'find', 'plan', 'context-pack', 'patch', 'validate']),
      prompt: z.string(),
      repoPath: z.string(),
    },
    async ({ mode, prompt, repoPath }) => {
      const state = await orchestrator.startRun({ mode, prompt, repoPath });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
      };
    },
  );

  server.tool(
    'get_run',
    'Get the current state of a run',
    { runId: z.string().uuid() },
    async ({ runId }) => {
      const state = await runStore.getRun(runId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
      };
    },
  );

  server.tool(
    'explain',
    'Lightweight explain mode for a codebase question',
    {
      prompt: z.string(),
      repoPath: z.string(),
    },
    async ({ prompt, repoPath }) => {
      const response = await chatService.chat({ prompt, repoPath });
      return {
        content: [{ type: 'text' as const, text: response.answer }],
      };
    },
  );

  server.tool(
    'find_files',
    'Find files related to a query in the repository',
    {
      query: z.string(),
      repoPath: z.string(),
      topK: z.number().optional(),
    },
    async ({ query, repoPath, topK }) => {
      const result = await retriever.retrieve(repoPath, query, topK ?? 10);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server started on stdio');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  startMcpServer().catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}
