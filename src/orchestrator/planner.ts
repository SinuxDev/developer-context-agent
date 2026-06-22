import type { TaskRequest, Plan, PlanStep } from '../core/schemas/index.js';
import { planSchema } from '../core/schemas/index.js';
import type { ModelRouter } from '../models/router.js';
import type { PromptBuilder } from '../context/prompt-builder.js';
import type { ContextPackage } from '../core/schemas/index.js';

const MODE_PLANS: Record<TaskRequest['mode'], (prompt: string) => Plan> = {
  explain: (prompt) => ({
    summary: `Explain: ${prompt}`,
    steps: [
      { index: 0, description: 'Retrieve relevant files', toolName: 'grep', riskLevel: 'low', requiresApproval: false },
      { index: 1, description: 'Read top files', toolName: 'read_file', riskLevel: 'low', requiresApproval: false },
      { index: 2, description: 'Search symbols', toolName: 'search_symbols', riskLevel: 'low', requiresApproval: false },
    ],
  }),
  find: (prompt) => ({
    summary: `Find files related to: ${prompt}`,
    steps: [
      { index: 0, description: 'Grep for keywords', toolName: 'grep', args: { pattern: prompt }, riskLevel: 'low', requiresApproval: false },
      { index: 1, description: 'Search symbols', toolName: 'search_symbols', args: { query: prompt }, riskLevel: 'low', requiresApproval: false },
      { index: 2, description: 'Check git status', toolName: 'git_status', riskLevel: 'low', requiresApproval: false },
    ],
  }),
  plan: (prompt) => ({
    summary: `Plan fix for: ${prompt}`,
    steps: [
      { index: 0, description: 'Explore codebase', toolName: 'grep', riskLevel: 'low', requiresApproval: false },
      { index: 1, description: 'Read affected files', toolName: 'read_file', riskLevel: 'low', requiresApproval: false },
      { index: 2, description: 'Check git diff', toolName: 'git_diff', riskLevel: 'low', requiresApproval: false },
    ],
  }),
  'context-pack': (prompt) => ({
    summary: `Build context package for: ${prompt}`,
    steps: [
      { index: 0, description: 'Retrieve and rank files', riskLevel: 'low', requiresApproval: false },
    ],
  }),
  patch: (prompt) => ({
    summary: `Propose patch for: ${prompt}`,
    steps: [
      { index: 0, description: 'Read target files', toolName: 'read_file', riskLevel: 'low', requiresApproval: false },
      { index: 1, description: 'Prepare patch', toolName: 'apply_patch', riskLevel: 'high', requiresApproval: true },
      { index: 2, description: 'Validate with tests', toolName: 'run_command', args: { command: 'npm test' }, riskLevel: 'high', requiresApproval: true },
    ],
  }),
  validate: (prompt) => ({
    summary: `Validate: ${prompt}`,
    steps: [
      { index: 0, description: 'Run lint', toolName: 'run_command', args: { command: 'npm run lint' }, riskLevel: 'high', requiresApproval: true },
      { index: 1, description: 'Run tests', toolName: 'run_command', args: { command: 'npm test' }, riskLevel: 'high', requiresApproval: true },
    ],
  }),
};

export class Planner {
  constructor(
    private readonly modelRouter: ModelRouter,
    private readonly promptBuilder: PromptBuilder,
  ) {}

  async createPlan(
    request: TaskRequest,
    contextPackage: ContextPackage,
  ): Promise<Plan> {
    if (!this.modelRouter.hasRemoteModel()) {
      return MODE_PLANS[request.mode](request.prompt);
    }

    try {
      const messages = this.promptBuilder.buildMessages(contextPackage, request.prompt);
      const adapter = this.modelRouter.getAdapter('planner');
      const response = await adapter.complete(
        [
          ...messages,
          {
            role: 'user',
            content: `Create a bounded plan (max ${request.budget?.maxSteps ?? 10} steps) for mode "${request.mode}". Return JSON: { "summary": string, "steps": [{ "index": number, "description": string, "toolName"?: string, "args"?: object, "riskLevel": "low"|"medium"|"high", "requiresApproval": boolean }] }`,
          },
        ],
        { jsonMode: true, maxTokens: 2000 },
      );

      if (response.content) {
        const parsed = JSON.parse(response.content);
        return planSchema.parse(parsed);
      }
    } catch {
      // fall back to template plan
    }

    return MODE_PLANS[request.mode](request.prompt);
  }
}

export function getModeTools(mode: TaskRequest['mode']): string[] {
  const map: Record<TaskRequest['mode'], string[]> = {
    explain: ['read_file', 'grep', 'search_symbols', 'list_dir'],
    find: ['grep', 'search_symbols', 'git_status', 'list_dir'],
    plan: ['read_file', 'grep', 'search_symbols', 'git_diff', 'list_dir'],
    'context-pack': ['grep', 'search_symbols', 'read_file'],
    patch: ['read_file', 'grep', 'apply_patch', 'run_command'],
    validate: ['run_command', 'git_diff'],
  };
  return map[mode];
}

export type { PlanStep };
