import { z } from 'zod';

export const taskModeSchema = z.enum([
  'explain',
  'find',
  'plan',
  'context-pack',
  'patch',
  'validate',
]);

export const runStatusSchema = z.enum([
  'pending',
  'planning',
  'executing',
  'awaiting_approval',
  'validating',
  'completed',
  'failed',
]);

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);

export const tokenUsageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
});

export const taskBudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxSteps: z.number().int().positive().default(10),
  topKFiles: z.number().int().positive().default(10),
});

export const taskConstraintsSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  requireApproval: z.boolean().default(true),
  sessionId: z.string().optional(),
});

export const taskRequestSchema = z.object({
  mode: taskModeSchema,
  prompt: z.string().min(1),
  repoPath: z.string().min(1),
  budget: taskBudgetSchema.optional(),
  constraints: taskConstraintsSchema.optional(),
});

export const planStepSchema = z.object({
  index: z.number().int().nonnegative(),
  description: z.string(),
  toolName: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  riskLevel: riskLevelSchema,
  requiresApproval: z.boolean().default(false),
});

export const planSchema = z.object({
  steps: z.array(planStepSchema).max(20),
  summary: z.string(),
});

export const approvalRequestSchema = z.object({
  id: z.string(),
  stepIndex: z.number().int(),
  toolName: z.string(),
  description: z.string(),
  args: z.record(z.unknown()).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

export const runStepSchema = z.object({
  index: z.number().int(),
  phase: z.enum(['plan', 'execute', 'review', 'tool']),
  toolName: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  truncated: z.boolean().default(false),
  durationMs: z.number().optional(),
  error: z.string().optional(),
});

export const runArtifactSchema = z.object({
  type: z.enum(['plan', 'patch', 'context-package', 'validation', 'summary']),
  content: z.unknown(),
  createdAt: z.string().datetime().optional(),
});

export const runStateSchema = z.object({
  id: z.string().uuid(),
  status: runStatusSchema,
  mode: taskModeSchema,
  prompt: z.string(),
  repoPath: z.string(),
  plan: planSchema.optional(),
  steps: z.array(runStepSchema).default([]),
  artifacts: z.array(runArtifactSchema).default([]),
  tokenUsage: tokenUsageSchema.default({}),
  approvalRequests: z.array(approvalRequestSchema).default([]),
  workingMemory: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const approveRequestSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
  comment: z.string().optional(),
});

export const chatRequestSchema = z.object({
  prompt: z.string().min(1),
  repoPath: z.string().min(1),
  sessionId: z.string().optional(),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  contextFiles: z.array(z.string()).default([]),
  tokenUsage: tokenUsageSchema,
});

export const contextFileSchema = z.object({
  path: z.string(),
  excerpt: z.string(),
  score: z.number(),
  symbols: z.array(z.string()).default([]),
});

export const contextPackageSchema = z.object({
  systemPrefix: z.string(),
  repoSummary: z.string(),
  files: z.array(contextFileSchema),
  symbols: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    file: z.string(),
    line: z.number().optional(),
  })).default([]),
  compressedHistory: z.string().optional(),
  estimatedTokens: z.number(),
});

export const modelRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

export const modelMessageSchema = z.object({
  role: modelRoleSchema,
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});

export const modelResponseSchema = z.object({
  content: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
  usage: tokenUsageSchema.optional(),
  finishReason: z.string().optional(),
});

export type TaskMode = z.infer<typeof taskModeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type TaskRequest = z.infer<typeof taskRequestSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type RunState = z.infer<typeof runStateSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApproveRequest = z.infer<typeof approveRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ContextPackage = z.infer<typeof contextPackageSchema>;
export type ModelMessage = z.infer<typeof modelMessageSchema>;
export type ModelResponse = z.infer<typeof modelResponseSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
