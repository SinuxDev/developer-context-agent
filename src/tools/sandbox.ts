import path from 'node:path';
import fs from 'node:fs';
export interface RepoAccessConfig {
  allowedRepoRoots: string[];
}

export class RepoSandbox {
  constructor(
    private readonly repoPath: string,
    private readonly allowedRoots: string[],
  ) {}

  get root(): string {
    return path.resolve(this.repoPath);
  }

  validateRepoAccess(): void {
    if (!fs.existsSync(this.root)) {
      throw new Error(`Repository path does not exist: ${this.root}`);
    }

    if (this.allowedRoots.length > 0) {
      const normalized = this.root + path.sep;
      const allowed = this.allowedRoots.some((root) => {
        const resolved = path.resolve(root) + path.sep;
        return normalized.startsWith(resolved);
      });
      if (!allowed) {
        throw new Error(`Repository path not in allowed roots: ${this.root}`);
      }
    }
  }

  resolve(relativePath: string): string {
    const resolved = path.resolve(this.root, relativePath);
    const rootWithSep = this.root + path.sep;
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Path escapes repository sandbox: ${relativePath}`);
    }
    return resolved;
  }

  toRelative(absolutePath: string): string {
    return path.relative(this.root, absolutePath).replace(/\\/g, '/');
  }
}

export function createSandbox(repoPath: string, config: RepoAccessConfig): RepoSandbox {
  const sandbox = new RepoSandbox(repoPath, config.allowedRepoRoots);
  sandbox.validateRepoAccess();
  return sandbox;
}
