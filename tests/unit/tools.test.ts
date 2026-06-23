import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSandbox } from '../../src/tools/sandbox.js';
import { createDefaultToolRegistry } from '../../src/tools/builtin.js';
import { loadConfig } from '../../src/core/config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-ts-app',
);

describe('tools', () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://dca:dca@localhost:5433/developer_context_agent',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });

  let registry: Awaited<ReturnType<typeof createDefaultToolRegistry>>;

  beforeAll(async () => {
    registry = await createDefaultToolRegistry(config);
  });

  it('sandbox blocks path escape', () => {
    const sandbox = createSandbox(fixturePath, config);
    expect(() => sandbox.resolve('../../../etc/passwd')).toThrow();
  });

  it('read_file reads repo file', async () => {
    const result = await registry.execute(
      'read_file',
      { path: 'src/auth.ts' },
      { repoPath: fixturePath },
    );
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.output)).toContain('validateEmail');
  });

  it('grep finds matches', async () => {
    const result = await registry.execute(
      'grep',
      { pattern: 'authMiddleware', path: '.' },
      { repoPath: fixturePath },
    );
    expect(result.success).toBe(true);
    const output = result.output as { matches: unknown[] };
    expect(output.matches.length).toBeGreaterThan(0);
  });

  it('rejects disallowed shell command', async () => {
    const result = await registry.execute(
      'run_command',
      { command: 'rm -rf /' },
      { repoPath: fixturePath },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('allowlist');
  });

  it('rejects invalid patch', async () => {
    const result = await registry.execute(
      'apply_patch',
      { patch: 'not a valid patch' },
      { repoPath: fixturePath },
    );
    expect(result.success).toBe(false);
  });
});
