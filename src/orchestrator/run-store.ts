import { eq } from 'drizzle-orm';
import type { RedisClient } from '../db/redis.js';
import type { Database } from '../db/client.js';
import { runs, runSteps, runArtifacts } from '../db/schema.js';
import type {
  RunState,
  TaskRequest,
  RunStep,
  ApprovalRequest,
} from '../core/schemas/index.js';
import { runStateSchema } from '../core/schemas/index.js';

const RUN_CACHE_TTL = 3600;

export class RunStore {
  constructor(
    private readonly database: Database,
    private readonly redis: RedisClient,
  ) {}

  private get db() {
    return this.database.db;
  }

  async createRun(request: TaskRequest): Promise<RunState> {
    const now = new Date().toISOString();
    const state: RunState = {
      id: crypto.randomUUID(),
      status: 'pending',
      mode: request.mode,
      prompt: request.prompt,
      repoPath: request.repoPath,
      steps: [],
      artifacts: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
      approvalRequests: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(runs).values({
      id: state.id,
      status: state.status,
      mode: state.mode,
      prompt: state.prompt,
      repoPath: state.repoPath,
      state,
      tokenUsage: state.tokenUsage,
    });

    await this.cacheRun(state);
    return state;
  }

  async getRun(id: string): Promise<RunState | null> {
    const cached = await this.redis.get(`run:${id}`);
    if (cached) {
      return runStateSchema.parse(JSON.parse(cached));
    }

    const rows = await this.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const state = runStateSchema.parse(row.state);
    await this.cacheRun(state);
    return state;
  }

  async updateRun(state: RunState): Promise<RunState> {
    state.updatedAt = new Date().toISOString();

    await this.db
      .update(runs)
      .set({
        status: state.status,
        state,
        tokenUsage: state.tokenUsage,
        updatedAt: new Date(),
      })
      .where(eq(runs.id, state.id));

    await this.cacheRun(state);
    return state;
  }

  async addStep(runId: string, step: RunStep): Promise<void> {
    await this.db.insert(runSteps).values({
      runId,
      stepIndex: step.index,
      phase: step.phase,
      toolName: step.toolName ?? null,
      input: step.input ?? null,
      output: step.output ?? null,
      truncated: step.truncated,
      durationMs: step.durationMs ?? null,
      bytesOut: step.output ? JSON.stringify(step.output).length : null,
    });
  }

  async addArtifact(
    runId: string,
    type: 'plan' | 'patch' | 'context-package' | 'validation' | 'summary',
    content: unknown,
  ): Promise<void> {
    await this.db.insert(runArtifacts).values({ runId, type, content });
  }

  async updateApproval(runId: string, approvalId: string, approved: boolean): Promise<RunState | null> {
    const state = await this.getRun(runId);
    if (!state) return null;

    const request = state.approvalRequests.find((a) => a.id === approvalId);
    if (request) {
      request.status = approved ? 'approved' : 'rejected';
    }

    if (approved && state.status === 'awaiting_approval') {
      state.status = 'executing';
    } else if (!approved) {
      state.status = 'failed';
      state.error = 'Approval rejected';
    }

    return this.updateRun(state);
  }

  private async cacheRun(state: RunState): Promise<void> {
    await this.redis.setex(`run:${state.id}`, RUN_CACHE_TTL, JSON.stringify(state));
  }
}
