# Developer Context Agent

Local **context agent** for AI coding assistants (Cursor, Claude Desktop, Windsurf, and any MCP client). It indexes your repo locally, finds relevant files with hybrid retrieval, and returns **token-budgeted context packs** — without calling an LLM itself.

## What it does

- **Indexes** your codebase locally (`.context-agent/` in the project)
- **Retrieves** via grep + TypeScript symbols + import graph + optional Ollama embeddings
- **Compresses** results into a context pack within a token budget
- **Exposes MCP tools** so Cursor (or any MCP host) can call your agent during chat

The host LLM (Cursor, Claude, etc.) does the reasoning. This agent supplies efficient context.

## Quick start

```bash
npm install
npm run context-agent -- index --repo .
npm run mcp
```

Or after build/publish:

```bash
npx developer-context-agent index
npx developer-context-agent mcp
```

## Cursor setup

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "context-agent": {
      "command": "npx",
      "args": ["-y", "developer-context-agent", "mcp"],
      "env": {
        "REPO_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

Restart Cursor. In chat, the model can call `get_context_pack`, `find_files`, `search_symbols`, etc.

### Cursor rule (recommended)

Create `.cursor/rules/context-agent.mdc`:

```markdown
Before reading large files or searching the codebase manually,
use the context-agent MCP tools:
1. get_context_pack for the user's question
2. find_files / search_symbols only if more detail is needed
```

## Claude Desktop / other MCP clients

Use the same stdio command in your MCP config:

```json
{
  "mcpServers": {
    "context-agent": {
      "command": "npx",
      "args": ["-y", "developer-context-agent", "mcp"],
      "env": {
        "REPO_PATH": "/absolute/path/to/your/repo"
      }
    }
  }
}
```

## CLI commands

| Command | Description |
|---------|-------------|
| `context-agent mcp` | Start MCP server (stdio) |
| `context-agent index [--repo path]` | Build local index |
| `context-agent status [--repo path]` | Index metadata |
| `context-agent pack --task "…"` | Print context pack to stdout |

## MCP tools

| Tool | Description |
|------|-------------|
| `get_context_pack` | Token-budgeted context for a task (primary tool) |
| `find_files` | Rank files by relevance |
| `search_symbols` | TypeScript/JavaScript symbol search |
| `grep` | Sandboxed ripgrep |
| `read_file` | Sandboxed file read |
| `index_repo` | Build/refresh local index |
| `index_status` | Index health |

## Optional: Ollama embeddings

Hybrid retrieval works without Ollama. For semantic vector search:

1. Install [Ollama](https://ollama.com)
2. `ollama pull nomic-embed-text`
3. Run `context-agent index`

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REPO_PATH` | `cwd` | Default repository path |
| `TOKEN_BUDGET_DEFAULT` | `8000` | Default context pack budget |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API for embeddings |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `ALLOWED_REPO_ROOTS` | — | Comma-separated path allowlist |

## Legacy HTTP server

The optional Fastify server (`npm run dev`) with Postgres/Redis is still available for supervised runs. The **recommended path** is the local MCP agent — no Docker required.

```bash
npm run docker:up   # only for HTTP /runs API
npm run db:migrate
npm run dev
```

## Testing

```bash
npm test
```

## License

MIT
