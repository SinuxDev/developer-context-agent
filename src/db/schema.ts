import { pgTable, text, timestamp, uuid, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull(),
  mode: text('mode').notNull(),
  prompt: text('prompt').notNull(),
  repoPath: text('repo_path').notNull(),
  state: jsonb('state').notNull(),
  tokenUsage: jsonb('token_usage').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('runs_status_idx').on(table.status),
  index('runs_repo_path_idx').on(table.repoPath),
]);

export const runSteps = pgTable('run_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  phase: text('phase').notNull(),
  toolName: text('tool_name'),
  input: jsonb('input'),
  output: jsonb('output'),
  truncated: boolean('truncated').notNull().default(false),
  durationMs: integer('duration_ms'),
  bytesOut: integer('bytes_out'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('run_steps_run_id_idx').on(table.runId),
]);

export const runArtifacts = pgTable('run_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  content: jsonb('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('run_artifacts_run_id_idx').on(table.runId),
]);

export const repoIndexMeta = pgTable('repo_index_meta', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoPath: text('repo_path').notNull(),
  repoHash: text('repo_hash').notNull(),
  metadata: jsonb('metadata').notNull(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('repo_index_meta_repo_hash_idx').on(table.repoHash),
]);

export const cacheEntries = pgTable('cache_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  cacheLayer: text('cache_layer').notNull(),
  cacheKey: text('cache_key').notNull(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('cache_entries_layer_key_idx').on(table.cacheLayer, table.cacheKey),
]);

export const sessionMemory = pgTable('session_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoPath: text('repo_path').notNull(),
  sessionId: text('session_id').notNull(),
  summary: text('summary').notNull(),
  turnCount: integer('turn_count').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('session_memory_repo_session_idx').on(table.repoPath, table.sessionId),
]);
