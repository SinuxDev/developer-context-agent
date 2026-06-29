import '../core/load-env.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ContextAgentService } from '../agent/context-service.js';
import { loadLocalConfig } from '../local/config.js';

function mcpText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

export async function startMcpServer(): Promise<void> {
  const localConfig = loadLocalConfig();
  const service = new ContextAgentService(localConfig);

  const server = new McpServer({
    name: 'context-agent',
    version: '0.2.0',
  });

  const repoPathSchema = z.object({
    repoPath: z.string().optional().describe('Absolute path to repository (defaults to REPO_PATH env or cwd)'),
  });

  server.tool(
    'get_context_pack',
    'Build a token-budgeted context pack for a coding task. Use this before answering codebase questions.',
    {
      task: z.string().describe('What the user is trying to understand or accomplish'),
      repoPath: z.string().optional(),
      maxTokens: z.number().int().positive().optional().describe('Token budget for the context pack'),
      topKFiles: z.number().int().positive().optional().describe('Maximum number of files to include'),
    },
    async ({ task, repoPath, maxTokens, topKFiles }) => {
      const pack = await service.getContextPack({ task, repoPath, maxTokens, topKFiles });
      return mcpText({
        markdown: pack.markdown,
        files: pack.files,
        tokenCount: pack.tokenCount,
        repoPath: pack.repoPath,
      });
    },
  );

  server.tool(
    'find_files',
    'Find repository files ranked by relevance to a query (grep + symbols + optional vectors)',
    {
      query: z.string(),
      repoPath: z.string().optional(),
      topK: z.number().int().positive().optional(),
    },
    async ({ query, repoPath, topK }) => {
      const result = await service.findFiles({ query, repoPath, topK });
      return mcpText(result);
    },
  );

  server.tool(
    'search_symbols',
    'Search TypeScript/JavaScript symbols (classes, functions, exports)',
    {
      query: z.string(),
      repoPath: z.string().optional(),
      maxResults: z.number().int().positive().optional(),
    },
    async ({ query, repoPath, maxResults }) => {
      const symbols = await service.searchSymbols(query, repoPath, maxResults ?? 20);
      return mcpText({ symbols });
    },
  );

  server.tool(
    'grep',
    'Search file contents with ripgrep inside the repository sandbox',
    {
      pattern: z.string(),
      repoPath: z.string().optional(),
      path: z.string().optional().describe('Relative path within repo'),
      maxMatches: z.number().int().positive().optional(),
    },
    async ({ pattern, repoPath, path: searchPath, maxMatches }) => {
      const result = await service.grep({ pattern, repoPath, path: searchPath, maxMatches });
      return mcpText(result);
    },
  );

  server.tool(
    'read_file',
    'Read a file from the repository (optionally a line range)',
    {
      path: z.string(),
      repoPath: z.string().optional(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    },
    async ({ path: filePath, repoPath, startLine, endLine }) => {
      const result = await service.readFile({ path: filePath, repoPath, startLine, endLine });
      return mcpText(result);
    },
  );

  server.tool(
    'index_repo',
    'Index the repository for hybrid retrieval (optional Ollama embeddings when available)',
    repoPathSchema.shape,
    async ({ repoPath }) => {
      const result = await service.indexRepo(repoPath);
      return mcpText(result);
    },
  );

  server.tool(
    'index_status',
    'Check local index status for a repository',
    repoPathSchema.shape,
    async ({ repoPath }) => {
      const status = service.indexStatus(repoPath);
      return mcpText(status);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Context Agent MCP server started (stdio)');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  startMcpServer().catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}
