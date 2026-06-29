import { z } from 'zod';

export const localConfigSchema = z.object({
  allowedRepoRoots: z.array(z.string()).default([]),
  tokenBudgetDefault: z.coerce.number().default(8000),
  ollamaBaseUrl: z.string().default('http://localhost:11434'),
  ollamaEmbedModel: z.string().default('nomic-embed-text'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type LocalConfig = z.infer<typeof localConfigSchema>;

export function loadLocalConfig(env: NodeJS.ProcessEnv = process.env): LocalConfig {
  const allowedRoots = env.ALLOWED_REPO_ROOTS
    ? env.ALLOWED_REPO_ROOTS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return localConfigSchema.parse({
    allowedRepoRoots: allowedRoots,
    tokenBudgetDefault: env.TOKEN_BUDGET_DEFAULT,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaEmbedModel: env.OLLAMA_EMBED_MODEL,
    logLevel: env.LOG_LEVEL,
  });
}

export function resolveRepoPath(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  const candidate = explicit ?? env.REPO_PATH ?? env.CURSOR_WORKSPACE ?? process.cwd();
  return candidate;
}
