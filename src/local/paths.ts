import path from 'node:path';
import fs from 'node:fs';

export const AGENT_DIR_NAME = '.context-agent';

export function getAgentDir(repoPath: string): string {
  return path.join(path.resolve(repoPath), AGENT_DIR_NAME);
}

export function getIndexDbPath(repoPath: string): string {
  return path.join(getAgentDir(repoPath), 'index.db');
}

export function ensureAgentDir(repoPath: string): string {
  const dir = getAgentDir(repoPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
