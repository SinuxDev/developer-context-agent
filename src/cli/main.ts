#!/usr/bin/env node
import '../core/load-env.js';
import { ContextAgentService } from '../agent/context-service.js';
import { startMcpServer } from '../mcp/server.js';
import { loadLocalConfig } from '../local/config.js';
import { resolveRepoPath } from '../local/config.js';

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const service = new ContextAgentService(loadLocalConfig());

  switch (command) {
    case 'mcp':
      await startMcpServer();
      break;

    case 'index': {
      const repoFlag = rest.indexOf('--repo');
      const repoPath = repoFlag >= 0 ? rest[repoFlag + 1] : undefined;
      const result = await service.indexRepo(repoPath);
      if (result.skipped) {
        console.log(`Index up to date (${result.chunkCount} chunks, ${result.fileCount} files)`);
      } else {
        console.log(`Indexed ${result.fileCount} files, ${result.chunkCount} chunks`);
        console.log(`Embeddings: ${result.embeddings ? 'yes (Ollama)' : 'no (hybrid grep/symbols only)'}`);
      }
      break;
    }

    case 'status': {
      const repoFlag = rest.indexOf('--repo');
      const repoPath = repoFlag >= 0 ? rest[repoFlag + 1] : undefined;
      const status = service.indexStatus(repoPath);
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case 'pack': {
      const taskFlag = rest.indexOf('--task');
      const repoFlag = rest.indexOf('--repo');
      const tokensFlag = rest.indexOf('--max-tokens');
      const task = taskFlag >= 0 ? rest[taskFlag + 1] : rest.join(' ');
      if (!task) {
        console.error('Usage: context-agent pack --task "your question" [--repo path] [--max-tokens 8000]');
        process.exit(1);
      }
      const pack = await service.getContextPack({
        task,
        repoPath: repoFlag >= 0 ? rest[repoFlag + 1] : undefined,
        maxTokens: tokensFlag >= 0 ? Number(rest[tokensFlag + 1]) : undefined,
      });
      console.log(pack.markdown);
      break;
    }

    case 'help':
    case '--help':
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  const repo = resolveRepoPath();
  console.log(`Context Agent — local codebase context for AI assistants

Usage:
  context-agent mcp              Start MCP server (Cursor, Claude Desktop, etc.)
  context-agent index [--repo]   Build local index + optional Ollama embeddings
  context-agent status [--repo]  Show index status
  context-agent pack --task "…"  Print a context pack to stdout

Environment:
  REPO_PATH              Default repository path (current: ${repo})
  TOKEN_BUDGET_DEFAULT   Default token budget (default: 8000)
  OLLAMA_BASE_URL        Ollama API for embeddings (default: http://localhost:11434)
  OLLAMA_EMBED_MODEL     Embedding model (default: nomic-embed-text)
  ALLOWED_REPO_ROOTS     Comma-separated path allowlist (optional)

MCP setup (Cursor / Claude Desktop):
  {
    "mcpServers": {
      "context-agent": {
        "command": "npx",
        "args": ["-y", "developer-context-agent", "mcp"],
        "env": { "REPO_PATH": "\${workspaceFolder}" }
      }
    }
  }
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
