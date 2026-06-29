import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CodeChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

const DEFAULT_LINES_PER_CHUNK = 60;
const OVERLAP_LINES = 8;

const INDEXABLE_EXTENSIONS = /\.(ts|tsx|js|jsx|md|json|yaml|yml)$/i;

export function isIndexableFile(filePath: string): boolean {
  return INDEXABLE_EXTENSIONS.test(filePath);
}

export async function chunkFile(
  repoPath: string,
  filePath: string,
  linesPerChunk = DEFAULT_LINES_PER_CHUNK,
): Promise<CodeChunk[]> {
  const fullPath = path.join(repoPath, filePath);
  let raw: string;
  try {
    raw = await fs.readFile(fullPath, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split('\n');
  if (lines.length === 0) return [];

  const chunks: CodeChunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + linesPerChunk, lines.length);
    const slice = lines.slice(start, end);
    const content = slice.join('\n');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    chunks.push({
      filePath,
      startLine: start + 1,
      endLine: end,
      content,
      contentHash,
    });

    if (end >= lines.length) break;
    start = end - OVERLAP_LINES;
  }

  return chunks;
}

export function hashRepoFiles(files: Array<{ path: string; size: number }>): string {
  const payload = files
    .map((f) => `${f.path}:${f.size}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(payload).digest('hex');
}
