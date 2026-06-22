import { z } from 'zod';

export const configSchema = z.object({
  port: z.coerce.number().default(3100),
  databaseUrl: z.string().min(1),
  redisUrl: z.string().min(1),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  defaultModel: z.string().default('openai:gpt-4o-mini'),
  plannerModel: z.string().default('openai:gpt-4o'),
  allowedRepoRoots: z.array(z.string()).default([]),
  apiKey: z.string().optional(),
  tokenBudgetDefault: z.coerce.number().default(32000),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const allowedRoots = env.ALLOWED_REPO_ROOTS
    ? env.ALLOWED_REPO_ROOTS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return configSchema.parse({
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    defaultModel: env.DEFAULT_MODEL,
    plannerModel: env.PLANNER_MODEL,
    allowedRepoRoots: allowedRoots,
    apiKey: env.API_KEY,
    tokenBudgetDefault: env.TOKEN_BUDGET_DEFAULT,
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
  });
}
