CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" text NOT NULL,
  "mode" text NOT NULL,
  "prompt" text NOT NULL,
  "repo_path" text NOT NULL,
  "state" jsonb NOT NULL,
  "token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "runs_status_idx" ON "runs" ("status");
CREATE INDEX IF NOT EXISTS "runs_repo_path_idx" ON "runs" ("repo_path");

CREATE TABLE IF NOT EXISTS "run_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE cascade,
  "step_index" integer NOT NULL,
  "phase" text NOT NULL,
  "tool_name" text,
  "input" jsonb,
  "output" jsonb,
  "truncated" boolean DEFAULT false NOT NULL,
  "duration_ms" integer,
  "bytes_out" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "run_steps_run_id_idx" ON "run_steps" ("run_id");

CREATE TABLE IF NOT EXISTS "run_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "run_artifacts_run_id_idx" ON "run_artifacts" ("run_id");

CREATE TABLE IF NOT EXISTS "repo_index_meta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_path" text NOT NULL,
  "repo_hash" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "repo_index_meta_repo_hash_idx" ON "repo_index_meta" ("repo_hash");

CREATE TABLE IF NOT EXISTS "cache_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cache_layer" text NOT NULL,
  "cache_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "cache_entries_layer_key_idx" ON "cache_entries" ("cache_layer", "cache_key");

CREATE TABLE IF NOT EXISTS "session_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_path" text NOT NULL,
  "session_id" text NOT NULL,
  "summary" text NOT NULL,
  "turn_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_memory_repo_session_idx" ON "session_memory" ("repo_path", "session_id");
