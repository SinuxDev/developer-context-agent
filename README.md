# developer-context-agent

[![npm version](https://img.shields.io/npm/v/developer-context-agent.svg)](https://www.npmjs.com/package/developer-context-agent)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/SinuxDev/developer-context-agent/blob/master/LICENSE)

**Token-efficient codebase context for AI assistants.**  
Indexes your repo locally, ranks relevant files with hybrid retrieval, and returns **token-budgeted context packs** via MCP — no LLM required in this package.

Works with **Cursor**, **Claude Desktop**, **Windsurf**, and any [Model Context Protocol](https://modelcontextprotocol.io) client.

> The host LLM (Cursor, Claude, etc.) does the reasoning.  
> This agent finds, ranks, and compresses codebase context.

## Install

```bash
npm install -g developer-context-agent
```

Or use without installing:

```bash
npx developer-context-agent --help
```

**Requirements:** Node.js 20+

## Quick start

```bash
cd your-project
context-agent index
context-agent pack --task "how does auth work"
```

### Use with Cursor

Add `.cursor/mcp.json` in your project:

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

Restart Cursor, enable the MCP server in **Settings → MCP**, then chat as usual. The model can call `get_context_pack` before reading files.

**Recommended Cursor rule** (`.cursor/rules/context-agent.mdc`):

```markdown
Before reading large files or searching the codebase manually, use context-agent MCP tools:
1. get_context_pack for the user's question
2. find_files / search_symbols only if more detail is needed
```

### Use with Claude Desktop / other MCP clients

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

## How it works

```
You ask in Cursor chat
       ↓
Host LLM calls get_context_pack("auth middleware")
       ↓
Agent: grep + symbols + import graph (+ optional vectors)
       ↓
Returns small markdown context pack (token-budgeted)
       ↓
Host LLM answers using that context
```

Local index is stored in `.context-agent/` inside your project (SQLite). Nothing is sent to a cloud service by this package.

## CLI

| Command | Description |
|---------|-------------|
| `context-agent mcp` | Start MCP server (stdio) |
| `context-agent index [--repo path]` | Build or refresh local index |
| `context-agent status [--repo path]` | Show index metadata |
| `context-agent pack --task "…" [--repo path]` | Print context pack to stdout |

Examples:

```bash
context-agent index --repo .
context-agent status --repo .
context-agent pack --task "explain hybrid retrieval" --max-tokens 6000
```

## MCP tools

| Tool | Description |
|------|-------------|
| `get_context_pack` | **Primary tool** — token-budgeted context for a task |
| `find_files` | Rank files by relevance (grep + symbols + vectors) |
| `search_symbols` | TypeScript/JavaScript symbol search |
| `grep` | Sandboxed ripgrep |
| `read_file` | Sandboxed file read (optional line range) |
| `index_repo` | Build or refresh local index |
| `index_status` | Index health and chunk count |

## Configuration

Environment variables (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `REPO_PATH` | `cwd` | Default repository path |
| `TOKEN_BUDGET_DEFAULT` | `8000` | Default context pack token budget |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API for embeddings |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `ALLOWED_REPO_ROOTS` | — | Comma-separated repo path allowlist |

## Optional: semantic search with Ollama

Hybrid retrieval works **without** Ollama (grep + symbols + import graph).  
For vector similarity search:

```bash
ollama pull nomic-embed-text
context-agent index
```

## Development

Clone and work on the source repo:

```bash
git clone https://github.com/SinuxDev/developer-context-agent.git
cd developer-context-agent
npm install
npm test
npm run context-agent -- index --repo .
npm run mcp
```

### Legacy HTTP server

An optional Fastify API (`POST /chat`, `POST /runs`) with Postgres/Redis is still in the codebase for supervised runs. It is **not** required for the MCP agent.

```bash
npm run docker:up
npm run db:migrate
npm run dev
```

See [docs/IDE_BRIDGE.md](docs/IDE_BRIDGE.md) for HTTP API details.

## Links

- **npm:** https://www.npmjs.com/package/developer-context-agent
- **Repository:** https://github.com/SinuxDev/developer-context-agent
- **Issues:** https://github.com/SinuxDev/developer-context-agent/issues

## License

[MIT](LICENSE)
