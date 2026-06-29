import { buildRepoMap } from '../context/repo-map.js';
import { LocalStore } from '../local/store.js';
import { chunkFile, hashRepoFiles, isIndexableFile } from './chunker.js';
import type { Embedder } from './embedder.js';

export interface IndexResult {
  repoPath: string;
  fileCount: number;
  chunkCount: number;
  embeddings: boolean;
  skipped: boolean;
  repoHash: string;
}

export interface RepoIndexerOptions {
  embedder?: Embedder;
  maxFiles?: number;
}

export class RepoIndexer {
  constructor(private readonly options: RepoIndexerOptions = {}) {}

  async index(repoPath: string): Promise<IndexResult> {
    const store = new LocalStore(repoPath);
    try {
      const repoMap = await buildRepoMap(repoPath);
      const indexableFiles = repoMap.files.filter((f) => isIndexableFile(f.path));
      const repoHash = hashRepoFiles(indexableFiles.map((f) => ({ path: f.path, size: f.size })));
      const existing = store.getIndexMeta(repoPath);

      if (existing.repoHash === repoHash && existing.chunkCount > 0) {
        return {
          repoPath,
          fileCount: existing.fileCount,
          chunkCount: existing.chunkCount,
          embeddings: existing.hasEmbeddings,
          skipped: true,
          repoHash,
        };
      }

      store.clearChunks();

      const files = indexableFiles.slice(0, this.options.maxFiles ?? 500);
      let chunkCount = 0;
      let hasEmbeddings = false;

      const embedder = this.options.embedder;
      if (embedder) {
        await embedder.checkAvailability();
      }

      for (const file of files) {
        const chunks = await chunkFile(repoPath, file.path);
        for (const chunk of chunks) {
          let embedding: Float32Array | null = null;
          if (embedder?.available) {
            embedding = await embedder.embed(chunk.content);
            if (embedding) hasEmbeddings = true;
          }
          store.insertChunk(
            chunk.filePath,
            chunk.startLine,
            chunk.endLine,
            chunk.content,
            chunk.contentHash,
            embedding,
          );
          chunkCount++;
        }
      }

      store.setIndexMeta(repoPath, repoHash, files.length);

      return {
        repoPath,
        fileCount: files.length,
        chunkCount,
        embeddings: hasEmbeddings,
        skipped: false,
        repoHash,
      };
    } finally {
      store.close();
    }
  }
}
