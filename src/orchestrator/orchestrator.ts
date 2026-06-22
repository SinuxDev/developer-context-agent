import type { AppConfig } from '../core/config.js';
import type { Logger } from '../observability/logger.js';
import type {
  TaskRequest,
  RunState,
  ApproveRequest,
} from '../core/schemas/index.js';
import { RunStore } from './run-store.js';
import { transition } from './state-machine.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { Reviewer } from './reviewer.js';
import { HybridRetriever } from '../context/retriever.js';
import { PromptBuilder } from '../context/prompt-builder.js';
import { buildRepoMap } from '../context/repo-map.js';
import { ModelRouter } from '../models/router.js';
import { createDefaultToolRegistry } from '../tools/builtin.js';
import { searchSymbols, buildSymbolIndex } from '../context/symbol-index.js';
import { metrics } from '../observability/metrics.js';
import { createSandbox } from '../tools/sandbox.js';
import type { RedisClient } from '../db/redis.js';

export class Orchestrator {
  private modelRouter: ModelRouter;
  private retriever: HybridRetriever;
  private promptBuilder: PromptBuilder;
  private planner: Planner;
  private executor: Executor;
  private reviewer: Reviewer;
  private toolsPromise: ReturnType<typeof createDefaultToolRegistry> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly runStore: RunStore,
    private readonly logger: Logger,
    redis?: RedisClient,
  ) {
    this.modelRouter = new ModelRouter(config);
    this.retriever = new HybridRetriever({ redis });
    this.promptBuilder = new PromptBuilder({ redis, tokenBudget: undefined });
    this.planner = new Planner(this.modelRouter, this.promptBuilder);
    this.reviewer = new Reviewer({} as never);
    this.executor = new Executor({} as never, this.retriever);
  }

  private async getTools() {
    if (!this.toolsPromise) {
      this.toolsPromise = createDefaultToolRegistry(this.config, async (repoPath, query, max) => {
        const index = await buildSymbolIndex(repoPath);
        return searchSymbols(index, query, max);
      });
    }
    const tools = await this.toolsPromise;
    this.promptBuilder = new PromptBuilder({ toolRegistry: tools, tokenBudget: undefined });
    this.planner = new Planner(this.modelRouter, this.promptBuilder);
    this.executor = new Executor(tools, this.retriever);
    this.reviewer = new Reviewer(tools);
    return tools;
  }

  async startRun(request: TaskRequest): Promise<RunState> {
    createSandbox(request.repoPath, this.config);

    let state = await this.runStore.createRun(request);
    await this.getTools();

    try {
      state.status = transition(state.status, 'planning');
      state = await this.runStore.updateRun(state);

      const repoMap = await buildRepoMap(request.repoPath);
      const retrieval = await this.retriever.retrieve(
        request.repoPath,
        request.prompt,
        request.budget?.topKFiles ?? 10,
      );

      const contextPackage = await this.promptBuilder.buildContextPackage({
        repoMap,
        task: request.prompt,
        rankedFiles: retrieval.files,
        symbols: retrieval.symbols,
      });

      await this.runStore.addArtifact(state.id, 'context-package', contextPackage);

      const plan = await this.planner.createPlan(request, contextPackage);
      state.plan = plan;
      await this.runStore.addArtifact(state.id, 'plan', plan);

      state.status = transition(state.status, 'executing');
      state = await this.runStore.updateRun(state);

      for (const step of plan.steps) {
        if (state.status === 'awaiting_approval') break;

        const result = await this.executor.executeStep(state, step, request);
        state = result.state;
        await this.runStore.updateRun(state);

        const lastStep = state.steps[state.steps.length - 1];
        if (lastStep) await this.runStore.addStep(state.id, lastStep);

        if (result.needsApproval) break;
      }

      if (state.status === 'awaiting_approval') {
        return state;
      }

      state.status = transition(state.status, 'validating');
      state = await this.runStore.updateRun(state);

      const review = await this.reviewer.review(state, plan);
      await this.runStore.addArtifact(state.id, 'validation', review);

      if (review.passed) {
        state.status = transition(state.status, 'completed');
        metrics.recordRunCompleted();
      } else {
        state.status = transition(state.status, 'failed');
        state.error = review.issues.join('; ');
        metrics.recordRunFailed();
      }

      const summary = {
        mode: state.mode,
        plan: plan.summary,
        stepsCompleted: state.steps.length,
        issues: review.issues,
      };
      await this.runStore.addArtifact(state.id, 'summary', summary);

      return this.runStore.updateRun(state);
    } catch (err) {
      this.logger.error({ err, runId: state.id }, 'Run failed');
      state.status = 'failed';
      state.error = err instanceof Error ? err.message : String(err);
      metrics.recordRunFailed();
      return this.runStore.updateRun(state);
    }
  }

  async approve(runId: string, approval: ApproveRequest): Promise<RunState> {
    let state = await this.runStore.updateApproval(runId, approval.approvalId, approval.approved);
    if (!state) {
      throw new Error('Run not found');
    }

    if (!approval.approved || state.status !== 'executing') {
      return state;
    }

    const currentState = state;
    const request: TaskRequest = {
      mode: currentState.mode,
      prompt: currentState.prompt,
      repoPath: currentState.repoPath,
    };

    const pendingStep = currentState.plan?.steps.find(
      (s) => currentState.approvalRequests.some(
        (a) => a.stepIndex === s.index && a.status === 'approved' && a.toolName === s.toolName,
      ),
    );

    if (pendingStep) {
      await this.getTools();
      const result = await this.executor.executeStep(currentState, pendingStep, request);
      state = result.state;
      await this.runStore.updateRun(state);
      const lastStep = state.steps[state.steps.length - 1];
      if (lastStep) await this.runStore.addStep(state.id, lastStep);
    }

    if (state.plan) {
      state.status = transition(state.status, 'validating');
      const review = await this.reviewer.review(state, state.plan);
      state.status = review.passed
        ? transition(state.status, 'completed')
        : transition(state.status, 'failed');
      if (!review.passed) state.error = review.issues.join('; ');
    }

    return this.runStore.updateRun(state);
  }
}
