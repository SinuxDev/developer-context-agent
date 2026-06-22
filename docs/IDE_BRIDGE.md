# IDE Bridge Contract

This document describes how IDE extensions (VS Code, Cursor, etc.) integrate with the Developer Context Agent HTTP API.

## Base URL

Default: `http://localhost:3100`

## Authentication

Optional API key via header:

```
X-API-Key: <your-api-key>
```

## Endpoints

### POST /runs

Start a supervised agent run.

```json
{
  "mode": "explain|find|plan|context-pack|patch|validate",
  "prompt": "Explain the auth middleware",
  "repoPath": "/absolute/path/to/repo",
  "budget": { "maxTokens": 32000, "maxSteps": 10, "topKFiles": 10 },
  "constraints": { "requireApproval": true, "sessionId": "optional-session-id" }
}
```

Response: `RunState` object with `id`, `status`, `plan`, `steps`, `artifacts`.

### GET /runs/:id

Poll run status. Returns full `RunState`.

### POST /runs/:id/approve

Approve or reject a gated action (patch, shell command).

```json
{
  "approvalId": "uuid",
  "approved": true,
  "comment": "optional"
}
```

### POST /chat

Lightweight explain mode without full run lifecycle.

```json
{
  "prompt": "What does src/auth.ts do?",
  "repoPath": "/absolute/path/to/repo",
  "sessionId": "optional"
}
```

### GET /metrics

Token usage, cache hit rates, latency, and cost estimates.

### GET /health

Liveness check for database and Redis.

## Integration Pattern

1. Extension detects workspace root as `repoPath`.
2. For quick questions, call `POST /chat`.
3. For multi-step tasks (plan, patch, validate), call `POST /runs` and poll `GET /runs/:id`.
4. When `status` is `awaiting_approval`, show UI and call `POST /runs/:id/approve`.
5. Display artifacts (`plan`, `patch`, `context-package`) from run state.

## MCP Alternative

Extensions can also connect via MCP stdio transport:

```bash
npx tsx src/mcp/server.ts
```

Tools: `start_run`, `get_run`, `explain`, `find_files`.
