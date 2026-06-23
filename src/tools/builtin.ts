import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { runRipgrep } from './ripgrep.js';
import { createSandbox } from './sandbox.js';
import type { AppConfig } from '../core/config.js';

const readFileInput = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

const readFileOutput = z.object({
  path: z.string(),
  content: z.string(),
  totalLines: z.number(),
});

const listDirInput = z.object({
  path: z.string().default('.'),
  maxDepth: z.number().int().min(1).max(5).default(2),
  maxEntries: z.number().int().min(1).max(500).default(100),
});

const listDirOutput = z.object({
  entries: z.array(z.object({
    path: z.string(),
    type: z.enum(['file', 'directory']),
  })),
  truncated: z.boolean(),
});

const grepInput = z.object({
  pattern: z.string().min(1),
  path: z.string().default('.'),
  maxMatches: z.number().int().min(1).max(200).default(50),
  fileGlob: z.string().optional(),
});

const grepOutput = z.object({
  matches: z.array(z.object({
    file: z.string(),
    line: z.number(),
    content: z.string(),
  })),
  truncated: z.boolean(),
});

const gitStatusOutput = z.object({
  branch: z.string().optional(),
  modified: z.array(z.string()),
  untracked: z.array(z.string()),
  staged: z.array(z.string()),
});

const gitDiffInput = z.object({
  path: z.string().optional(),
  staged: z.boolean().default(false),
});

const gitDiffOutput = z.object({
  diff: z.string(),
});

const searchSymbolsInput = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(50).default(20),
});

const searchSymbolsOutput = z.object({
  symbols: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    file: z.string(),
    line: z.number().optional(),
  })),
});

const applyPatchInput = z.object({
  patch: z.string().min(1),
});

const applyPatchOutput = z.object({
  applied: z.boolean(),
  files: z.array(z.string()),
  preview: z.string().optional(),
});

const runCommandInput = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

const runCommandOutput = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
});

const summarizeTextInput = z.object({
  text: z.string().min(1),
  maxLength: z.number().int().min(50).max(2000).default(500),
});

const summarizeTextOutput = z.object({
  summary: z.string(),
});

async function loadAllowlist(): Promise<string[]> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const allowlistPath = path.resolve(dir, '../../config/allowlist.json');
  const raw = await fs.readFile(allowlistPath, 'utf8');
  return JSON.parse(raw) as string[];
}

function isCommandAllowed(command: string, allowlist: string[]): boolean {
  const normalized = command.trim();
  return allowlist.some((allowed) => {
    if (normalized === allowed) return true;
    if (normalized.startsWith(allowed + ' ')) return true;
    return false;
  });
}

function validatePatch(patch: string): void {
  const lines = patch.split('\n');
  const hasHunk = lines.some((l) => l.startsWith('@@'));
  if (!hasHunk) {
    throw new Error('Patch must contain unified diff hunks (@@ markers)');
  }
  if (patch.length > 100_000) {
    throw new Error('Patch exceeds maximum size');
  }
}

export async function createDefaultToolRegistry(
  config: AppConfig,
  symbolSearch?: (repoPath: string, query: string, max: number) => Promise<Array<{ name: string; kind: string; file: string; line?: number }>>,
): Promise<ToolRegistry> {
  const { ToolRegistry: Registry } = await import('./registry.js');
  const registry = new Registry();
  const allowlist = await loadAllowlist();

  registry.register({
    name: 'read_file',
    description: 'Read a file from the repository with optional line range',
    category: 'filesystem',
    riskLevel: 'low',
    inputSchema: readFileInput,
    outputSchema: readFileOutput,
    execute: async (input, ctx) => {
      const sandbox = createSandbox(ctx.repoPath, config);
      const absPath = sandbox.resolve(input.path);
      const content = await fs.readFile(absPath, 'utf8');
      const lines = content.split('\n');
      const start = (input.startLine ?? 1) - 1;
      const end = input.endLine ?? lines.length;
      const slice = lines.slice(start, end).join('\n');
      return {
        path: input.path,
        content: slice,
        totalLines: lines.length,
      };
    },
  });

  registry.register({
    name: 'list_dir',
    description: 'List directory entries within the repository',
    category: 'filesystem',
    riskLevel: 'low',
    inputSchema: listDirInput,
    outputSchema: listDirOutput,
    execute: async (input, ctx) => {
      const sandbox = createSandbox(ctx.repoPath, config);
      const absPath = sandbox.resolve(input.path ?? '.');
      const maxDepth = input.maxDepth ?? 2;
      const maxEntries = input.maxEntries ?? 100;
      const entries: Array<{ path: string; type: 'file' | 'directory' }> = [];
      let truncated = false;

      async function walk(dir: string, depth: number): Promise<void> {
        if (depth > maxDepth || entries.length >= maxEntries) {
          truncated = true;
          return;
        }
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name === 'node_modules' || item.name === '.git') continue;
          const rel = sandbox.toRelative(path.join(dir, item.name));
          entries.push({
            path: rel,
            type: item.isDirectory() ? 'directory' : 'file',
          });
          if (entries.length >= maxEntries) {
            truncated = true;
            return;
          }
          if (item.isDirectory() && depth < maxDepth) {
            await walk(path.join(dir, item.name), depth + 1);
          }
        }
      }

      await walk(absPath, 1);
      return { entries, truncated };
    },
  });

  registry.register({
    name: 'grep',
    description: 'Search file contents using ripgrep',
    category: 'search',
    riskLevel: 'low',
    inputSchema: grepInput,
    outputSchema: grepOutput,
    execute: async (input, ctx) => {
      const sandbox = createSandbox(ctx.repoPath, config);
      const searchPath = sandbox.resolve(input.path ?? '.');
      const maxMatches = input.maxMatches ?? 50;

      const args = [
        '--json',
        '--max-count', String(maxMatches),
        input.pattern,
        searchPath,
      ];
      if (input.fileGlob) {
        args.unshift('--glob', input.fileGlob);
      }

      const { stdout } = await runRipgrep(args, { cwd: sandbox.root });
      const matches: Array<{ file: string; line: number; content: string }> = [];
      for (const line of stdout.split('\n').filter(Boolean)) {
        const parsed = JSON.parse(line) as { type: string; data: { path: { text: string }; line_number: number; lines: { text: string } } };
        if (parsed.type === 'match') {
          matches.push({
            file: sandbox.toRelative(parsed.data.path.text),
            line: parsed.data.line_number,
            content: parsed.data.lines.text.trim(),
          });
        }
      }
      return { matches, truncated: matches.length >= maxMatches };
    },
  });

  registry.register({
    name: 'git_status',
    description: 'Get git status for the repository',
    category: 'git',
    riskLevel: 'low',
    inputSchema: z.object({}),
    outputSchema: gitStatusOutput,
    execute: async (_input, ctx) => {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit(ctx.repoPath);
      const status = await git.status();
      return {
        branch: status.current ?? undefined,
        modified: status.modified,
        untracked: status.not_added,
        staged: status.staged,
      };
    },
  });

  registry.register({
    name: 'git_diff',
    description: 'Get git diff for the repository or a specific file',
    category: 'git',
    riskLevel: 'low',
    inputSchema: gitDiffInput,
    outputSchema: gitDiffOutput,
    execute: async (input, ctx) => {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit(ctx.repoPath);
      const args = input.staged ? ['--cached'] : [];
      if (input.path) args.push('--', input.path);
      const diff = await git.diff(args);
      return { diff };
    },
  });

  registry.register({
    name: 'search_symbols',
    description: 'Search TypeScript/JavaScript symbols in the repository',
    category: 'search',
    riskLevel: 'low',
    inputSchema: searchSymbolsInput,
    outputSchema: searchSymbolsOutput,
    execute: async (input, ctx) => {
      if (symbolSearch) {
        const symbols = await symbolSearch(ctx.repoPath, input.query, input.maxResults ?? 20);
        return { symbols };
      }
      return { symbols: [] };
    },
  });

  registry.register({
    name: 'apply_patch',
    description: 'Apply a structured unified diff patch to the repository',
    category: 'patch',
    riskLevel: 'high',
    inputSchema: applyPatchInput,
    outputSchema: applyPatchOutput,
    execute: async (input, ctx) => {
      validatePatch(input.patch);
      const { simpleGit } = await import('simple-git');
      const { writeFile, unlink } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const git = simpleGit(ctx.repoPath);
      const patchFile = path.join(tmpdir(), `dca-patch-${Date.now()}.diff`);
      await writeFile(patchFile, input.patch, 'utf8');
      try {
        await git.raw(['apply', '--check', patchFile]);
      } catch {
        throw new Error('Patch failed validation (git apply --check)');
      } finally {
        await unlink(patchFile).catch(() => undefined);
      }
      return {
        applied: false,
        files: extractPatchFiles(input.patch),
        preview: input.patch.slice(0, 2000),
      };
    },
  });

  registry.register({
    name: 'run_command',
    description: 'Run an allowlisted shell command in the repository',
    category: 'shell',
    riskLevel: 'high',
    inputSchema: runCommandInput,
    outputSchema: runCommandOutput,
    execute: async (input, ctx) => {
      if (!isCommandAllowed(input.command, allowlist)) {
        throw new Error(`Command not in allowlist: ${input.command}`);
      }
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      const sandbox = createSandbox(ctx.repoPath, config);
      const cwd = input.cwd ? sandbox.resolve(input.cwd) : sandbox.root;
      const { stdout, stderr } = await execAsync(input.command, {
        cwd,
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      });
      return { exitCode: 0, stdout, stderr };
    },
  });

  registry.register({
    name: 'summarize_text',
    description: 'Compress long text into a shorter summary',
    category: 'model',
    riskLevel: 'low',
    inputSchema: summarizeTextInput,
    outputSchema: summarizeTextOutput,
    execute: async (input) => {
      const maxLength = input.maxLength ?? 500;
      const words = input.text.split(/\s+/);
      const targetWords = Math.floor(maxLength / 5);
      if (words.length <= targetWords) {
        return { summary: input.text };
      }
      return {
        summary: words.slice(0, targetWords).join(' ') + '...',
      };
    },
  });

  return registry;
}

function extractPatchFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      const file = line.slice(4).replace(/^[ab]\//, '').trim();
      if (file !== '/dev/null') files.add(file);
    }
  }
  return [...files];
}
