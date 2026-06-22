# Developer Context Agent

Token-efficient, codebase-aware AI agent runtime for TypeScript/Node.js developer workflows.

## Overview

Developer Context Agent is a reusable backend service that acts as a **context router and coding agent** for IDEs, CLIs, and automation workflows. It minimizes token waste through:

- Hybrid retrieval (ripgrep + ts-morph symbols + import graph)
- Prompt-prefix caching
- Tool output summarization
- Token-budgeted context packages
- Supervised planner → executor → reviewer loop

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis)
- ripgrep (`rg`) on PATH

### Setup

```bash
cp .env.example .env
npm install
npm run docker:up
npm run db:migrate
npm run dev
```

Server runs at `http://localhost:3100`.

### Health Check

```bash
curl http://localhost:3100/health
```

### Explain a codebase (lightweight)

```bash
curl -X POST http://localhost:3100/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key" \
  -d '{"prompt":"What does auth do?","repoPath":"/path/to/your/repo"}'
```

### Start a full run

```bash
curl -X POST http://localhost:3100/runs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key" \
  -d '{"mode":"find","prompt":"auth middleware bug","repoPath":"/path/to/your/repo"}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + DB/Redis checks |
| GET | `/metrics` | Token, cache, latency metrics |
| POST | `/chat` | Lightweight explain mode |
| POST | `/runs` | Start supervised agent run |
| GET | `/runs/:id` | Get run state |
| POST | `/runs/:id/approve` | Approve gated actions |

See [docs/IDE_BRIDGE.md](docs/IDE_BRIDGE.md) for IDE integration contract.

## Architecture

```
src/
├── app/           # Fastify server + routes
├── core/          # Config, Zod schemas, types
├── orchestrator/  # Run lifecycle, planner, executor, reviewer
├── context/       # Repo map, retrieval, prompt building
├── tools/         # Sandboxed tool registry
├── memory/        # Multi-layer cache + session memory
├── models/        # OpenAI, Anthropic, local compressor
├── observability/ # Logging + metrics
└── mcp/           # MCP server for IDE integration
```

## MCP Server

```bash
npx tsx src/mcp/server.ts
```

Tools: `start_run`, `get_run`, `explain`, `find_files`.

## Testing

```bash
npm test
```

Unit tests run without Docker. Integration tests require Postgres + Redis.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3100 | HTTP port |
| `DATABASE_URL` | postgres://dca:dca@localhost:5432/developer_context_agent | Postgres |
| `REDIS_URL` | redis://localhost:6379 | Redis |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `API_KEY` | — | Optional API auth |
| `TOKEN_BUDGET_DEFAULT` | 32000 | Default token budget |

## License

MIT
