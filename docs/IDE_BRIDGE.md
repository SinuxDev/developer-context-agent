# Context Agent MCP Bridge

Connect any MCP-compatible AI client to the local context agent.

## Supported clients

- **Cursor** — `.cursor/mcp.json`
- **Claude Desktop** — `claude_desktop_config.json`
- **Windsurf**, **Zed**, and other MCP hosts — same stdio config

## MCP server command

```bash
npx developer-context-agent mcp
```

## Environment

| Variable | Description |
|----------|-------------|
| `REPO_PATH` | Workspace root (use `${workspaceFolder}` in Cursor) |
| `TOKEN_BUDGET_DEFAULT` | Default max tokens for `get_context_pack` |
| `OLLAMA_BASE_URL` | Optional embeddings via Ollama |

## Primary tool

Call **`get_context_pack`** before answering codebase questions. It returns markdown + file list within a token budget.

## Other tools

`find_files`, `search_symbols`, `grep`, `read_file`, `index_repo`, `index_status`

## HTTP API (optional legacy)

The Fastify server on port 3100 (`POST /chat`, `POST /runs`) remains available for custom integrations. MCP is the recommended integration path.
