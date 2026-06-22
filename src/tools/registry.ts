import { z } from 'zod';
import type { RiskLevel } from '../core/schemas/index.js';

export const toolRiskLevelSchema = z.enum(['low', 'medium', 'high']);

export interface ToolContext {
  repoPath: string;
  runId?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: 'filesystem' | 'search' | 'git' | 'patch' | 'shell' | 'model';
  riskLevel: RiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  durationMs: number;
  bytesOut: number;
  truncated: boolean;
}

const MAX_OUTPUT_BYTES = 32_000;

export function truncateOutput(text: string, maxBytes = MAX_OUTPUT_BYTES): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) {
    return { text, truncated: false };
  }
  return {
    text: buf.subarray(0, maxBytes).toString('utf8') + '\n...[truncated]',
    truncated: true,
  };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  getDescriptions(): Array<{ name: string; description: string; riskLevel: RiskLevel }> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      riskLevel: t.riskLevel,
    }));
  }

  async execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
        durationMs: 0,
        bytesOut: 0,
        truncated: false,
      };
    }

    const start = Date.now();
    try {
      const parsed = tool.inputSchema.parse(input);
      const output = await tool.execute(parsed, ctx);
      const validated = tool.outputSchema.parse(output);
      const serialized = JSON.stringify(validated);
      const { text, truncated } = truncateOutput(serialized);

      return {
        success: true,
        output: truncated ? JSON.parse(text.replace('\n...[truncated]', '')) : validated,
        durationMs: Date.now() - start,
        bytesOut: Buffer.byteLength(serialized, 'utf8'),
        truncated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        durationMs: Date.now() - start,
        bytesOut: 0,
        truncated: false,
      };
    }
  }
}
