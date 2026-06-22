import type { RunState, Plan } from '../core/schemas/index.js';
import type { ToolRegistry } from '../tools/registry.js';

export interface ReviewResult {
  passed: boolean;
  issues: string[];
  validationOutput?: unknown;
}

export class Reviewer {
  constructor(private readonly tools: ToolRegistry) {}

  async review(state: RunState, plan: Plan): Promise<ReviewResult> {
    const issues: string[] = [];

    const patchSteps = state.steps.filter((s) => s.toolName === 'apply_patch');
    for (const step of patchSteps) {
      const output = step.output as { applied?: boolean; preview?: string } | undefined;
      if (output?.preview && !output.preview.includes('@@')) {
        issues.push('Patch step produced invalid unified diff format');
      }
    }

    if (state.mode === 'validate' || state.mode === 'patch') {
      const lintResult = await this.tools.execute(
        'run_command',
        { command: 'npx tsc --noEmit' },
        { repoPath: state.repoPath, runId: state.id },
      );

      if (!lintResult.success) {
        issues.push(`Type check failed: ${lintResult.error}`);
      }

      state.steps.push({
        index: state.steps.length,
        phase: 'review',
        toolName: 'run_command',
        input: { command: 'npx tsc --noEmit' },
        output: lintResult.output ?? { error: lintResult.error },
        truncated: lintResult.truncated,
        durationMs: lintResult.durationMs,
      });

      return {
        passed: issues.length === 0,
        issues,
        validationOutput: lintResult.output,
      };
    }

    if (state.steps.length === 0) {
      issues.push('No steps executed');
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }
}
