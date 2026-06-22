import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface RepoFileEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface RepoMap {
  repoPath: string;
  repoHash: string;
  packageName?: string;
  scripts: Record<string, string>;
  tsconfigPaths: Record<string, string[]>;
  entryPoints: string[];
  files: RepoFileEntry[];
  folderOverview: string;
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', 'build']);

export async function buildRepoMap(repoPath: string): Promise<RepoMap> {
  const absPath = path.resolve(repoPath);
  const files: RepoFileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        const rel = path.relative(absPath, full).replace(/\\/g, '/');
        if (isRelevantFile(rel)) {
          files.push({ path: rel, size: stat.size, mtimeMs: stat.mtimeMs });
        }
      }
    }
  }

  await walk(absPath);

  const hash = crypto
    .createHash('sha256')
    .update(files.map((f) => `${f.path}:${f.mtimeMs}`).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);

  let packageName: string | undefined;
  let scripts: Record<string, string> = {};
  const pkgPath = path.join(absPath, 'package.json');
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    packageName = pkg.name;
    scripts = pkg.scripts ?? {};
  } catch {
    // no package.json
  }

  const tsconfigPaths = await loadTsconfigPaths(absPath);
  const entryPoints = detectEntryPoints(files, scripts);
  const folderOverview = buildFolderOverview(files);

  return {
    repoPath: absPath,
    repoHash: hash,
    packageName,
    scripts,
    tsconfigPaths,
    entryPoints,
    files,
    folderOverview,
  };
}

function isRelevantFile(rel: string): boolean {
  const ext = path.extname(rel);
  return ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext);
}

async function loadTsconfigPaths(repoPath: string): Promise<Record<string, string[]>> {
  const tsconfigPath = path.join(repoPath, 'tsconfig.json');
  try {
    const raw = JSON.parse(await fs.readFile(tsconfigPath, 'utf8')) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    return raw.compilerOptions?.paths ?? {};
  } catch {
    return {};
  }
}

function detectEntryPoints(files: RepoFileEntry[], scripts: Record<string, string>): string[] {
  const candidates = new Set<string>();
  for (const f of files) {
    if (f.path === 'src/index.ts' || f.path === 'index.ts') {
      candidates.add(f.path);
    }
  }
  if (scripts.start?.includes('dist/index')) candidates.add('src/index.ts');
  return [...candidates];
}

function buildFolderOverview(files: RepoFileEntry[]): string {
  const folders = new Map<string, number>();
  for (const f of files) {
    const dir = path.dirname(f.path);
  const top = dir === '.' ? '(root)' : dir.split('/')[0] ?? dir;
    folders.set(top, (folders.get(top) ?? 0) + 1);
  }
  return [...folders.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name}: ${count} files`)
    .join(', ');
}

export function summarizeRepoMap(map: RepoMap): string {
  const lines = [
    `Package: ${map.packageName ?? 'unknown'}`,
    `Files: ${map.files.length}`,
    `Entry points: ${map.entryPoints.join(', ') || 'none detected'}`,
    `Scripts: ${Object.keys(map.scripts).join(', ') || 'none'}`,
    `Overview: ${map.folderOverview}`,
  ];
  return lines.join('\n');
}
