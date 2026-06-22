import { eq, and } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { sessionMemory } from '../db/schema.js';
import { HistoryCompressor } from '../context/compressor.js';

const COMPRESS_EVERY_TURNS = 5;

export class SessionMemoryStore {
  private compressor = new HistoryCompressor();

  constructor(private readonly database: Database) {}

  private get db() {
    return this.database.db;
  }

  async getSummary(repoPath: string, sessionId: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(sessionMemory)
      .where(and(eq(sessionMemory.repoPath, repoPath), eq(sessionMemory.sessionId, sessionId)))
      .limit(1);

    return rows[0]?.summary ?? null;
  }

  async appendTurn(
    repoPath: string,
    sessionId: string,
    turn: string,
  ): Promise<string> {
    const existing = await this.db
      .select()
      .from(sessionMemory)
      .where(and(eq(sessionMemory.repoPath, repoPath), eq(sessionMemory.sessionId, sessionId)))
      .limit(1);

    const row = existing[0];
    const newTurnCount = (row?.turnCount ?? 0) + 1;
    let summary = row?.summary ? `${row.summary}\n---\n${turn}` : turn;

    if (newTurnCount % COMPRESS_EVERY_TURNS === 0) {
      const entries = summary.split('\n---\n');
      summary = await this.compressor.compressHistory(entries, 1500);
    }

    if (row) {
      await this.db
        .update(sessionMemory)
        .set({ summary, turnCount: newTurnCount, updatedAt: new Date() })
        .where(eq(sessionMemory.id, row.id));
    } else {
      await this.db.insert(sessionMemory).values({
        repoPath,
        sessionId,
        summary,
        turnCount: 1,
      });
    }

    return summary;
  }
}
