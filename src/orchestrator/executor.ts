import type { Plan, PlanStep, RunState, TaskRequest } from '../core/schemas/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import { HistoryCompressor } from '../context/compressor.js';
import type { HybridRetriever } from '../context/retriever.js';

export class Executor {
  private compressor = new HistoryCompressor();

  constructor(
    private readonly tools: ToolRegistry,
    private readonly retriever: HybridRetriever,
  ) {}

  async executeStep(
    state: RunState,
    step: PlanStep,
    request: TaskRequest,
  ): Promise<{ state: RunState; needsApproval: boolean }> {
    const stepIndex = state.steps.length;
    let needsApproval = step.requiresApproval;

    if (step.toolName) {
      const tool = this.tools.get(step.toolName);
      if (tool && tool.riskLevel === 'high' && request.constraints?.requireApproval !== false) {
        needsApproval = true;
      }

      if (needsApproval && step.requiresApproval) {
        const approvalId = crypto.randomUUID();
        state.approvalRequests.push({
          id: approvalId,
          stepIndex: step.index,
          toolName: step.toolName,
          description: step.description,
          args: step.args,
          status: 'pending',
        });
        state.status = 'awaiting_approval';
        return { state, needsApproval: true };
      }

      const start = Date.now();
      const args = await this.resolveArgs(step, request);
      const result = await this.tools.execute(step.toolName, args, {
        repoPath: state.repoPath,
        runId: state.id,
      });

      const outputSummary = result.success && result.output
        ? await this.compressor.compressToolOutput(
            step.toolName,
            JSON.stringify(result.output),
          )
        : result.error ?? 'Tool failed';

      state.steps.push({
        index: stepIndex,
        phase: 'tool',
        toolName: step.toolName,
        input: args,
        output: result.success ? result.output : { error: result.error },
        truncated: result.truncated,
        durationMs: Date.now() - start,
        error: result.success ? undefined : result.error,
      });

      state.workingMemory = state.workingMemory
        ? `${state.workingMemory}\n[${step.toolName}]: ${outputSummary}`
        : `[${step.toolName}]: ${outputSummary}`;
    } else {
      state.steps.push({
        index: stepIndex,
        phase: 'execute',
        input: { description: step.description },
        output: { status: 'completed' },
        truncated: false,
      });
    }

    return { state, needsApproval: false };
  }

  private async resolveArgs(step: PlanStep, request: TaskRequest): Promise<Record<string, unknown>> {
    const args = { ...step.args };

    if (step.toolName === 'grep' && !args.pattern) {
      args.pattern = request.prompt.split(' ').slice(0, 3).join('|');
    }
    if (step.toolName === 'search_symbols' && !args.query) {
      args.query = request.prompt;
    }
    if (step.toolName === 'read_file' && !args.path) {
      const retrieval = await this.retriever.retrieve(request.repoPath, request.prompt, 1);
      args.path = retrieval.files[0]?.path ?? 'package.json';
    }

    return args;
  }
}
