import Database from 'better-sqlite3';
import { ensureAgentDir, getIndexDbPath } from './paths.js';

export interface ChunkRecord {
  id: number;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  embedding: Float32Array | null;
}

export interface IndexMeta {
  repoPath: string;
  repoHash: string;
  chunkCount: number;
  fileCount: number;
  hasEmbeddings: boolean;
  indexedAt: string | null;
}

export interface CacheEntry {
  value: string;
  expiresAt: number | null;
}

export class LocalStore {
  private db: Database.Database;

  constructor(repoPath: string) {
    ensureAgentDir(repoPath);
    this.db = new Database(getIndexDbPath(repoPath));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        repo_path TEXT NOT NULL,
        repo_hash TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        indexed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS chunks_file_path_idx ON chunks (file_path);

      CREATE TABLE IF NOT EXISTS cache_entries (
        cache_key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      );
    `);
  }

  getIndexMeta(repoPath: string): IndexMeta {
    const row = this.db.prepare(
      'SELECT repo_path, repo_hash, file_count, indexed_at FROM index_meta WHERE id = 1',
    ).get() as { repo_path: string; repo_hash: string; file_count: number; indexed_at: string | null } | undefined;

    const chunkStats = this.db.prepare(
      'SELECT COUNT(*) as count, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded FROM chunks',
    ).get() as { count: number; embedded: number | null };

    return {
      repoPath,
      repoHash: row?.repo_hash ?? '',
      chunkCount: chunkStats?.count ?? 0,
      fileCount: row?.file_count ?? 0,
      hasEmbeddings: (chunkStats?.embedded ?? 0) > 0,
      indexedAt: row?.indexed_at ?? null,
    };
  }

  setIndexMeta(repoPath: string, repoHash: string, fileCount: number): void {
    this.db.prepare(`
      INSERT INTO index_meta (id, repo_path, repo_hash, file_count, indexed_at)
      VALUES (1, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        repo_path = excluded.repo_path,
        repo_hash = excluded.repo_hash,
        file_count = excluded.file_count,
        indexed_at = datetime('now')
    `).run(repoPath, repoHash, fileCount);
  }

  clearChunks(): void {
    this.db.prepare('DELETE FROM chunks').run();
  }

  insertChunk(
    filePath: string,
    startLine: number,
    endLine: number,
    content: string,
    contentHash: string,
    embedding: Float32Array | null,
  ): void {
    this.db.prepare(`
      INSERT INTO chunks (file_path, start_line, end_line, content, content_hash, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      filePath,
      startLine,
      endLine,
      content,
      contentHash,
      embedding ? Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength) : null,
    );
  }

  listChunks(): ChunkRecord[] {
    const rows = this.db.prepare(
      'SELECT id, file_path, start_line, end_line, content, embedding FROM chunks',
    ).all() as Array<{
      id: number;
      file_path: string;
      start_line: number;
      end_line: number;
      content: string;
      embedding: Buffer | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      embedding: row.embedding
        ? new Float32Array(
            row.embedding.buffer,
            row.embedding.byteOffset,
            row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
          )
        : null,
    }));
  }

  vectorSearch(queryEmbedding: Float32Array, topK: number): Array<{ filePath: string; score: number; content: string }> {
    const chunks = this.listChunks().filter((c) => c.embedding);
    const scored = chunks
      .map((chunk) => ({
        filePath: chunk.filePath,
        score: cosineSimilarity(queryEmbedding, chunk.embedding!),
        content: chunk.content,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  getCache(key: string): CacheEntry | null {
    const row = this.db.prepare(
      'SELECT value, expires_at FROM cache_entries WHERE cache_key = ?',
    ).get(key) as { value: string; expires_at: number | null } | undefined;

    if (!row) return null;
    if (row.expires_at !== null && row.expires_at < Date.now()) {
      this.db.prepare('DELETE FROM cache_entries WHERE cache_key = ?').run(key);
      return null;
    }
    return { value: row.value, expiresAt: row.expires_at };
  }

  setCache(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.db.prepare(`
      INSERT INTO cache_entries (cache_key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
    `).run(key, value, expiresAt);
  }

  close(): void {
    this.db.close();
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
