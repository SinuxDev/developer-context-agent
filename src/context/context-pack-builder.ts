import type { ContextPackage } from '../core/schemas/index.js';
import { countTokens } from './token-budget.js';

export interface ContextPackOutput {
  task: string;
  repoPath: string;
  markdown: string;
  package: ContextPackage;
  files: Array<{ path: string; score: number; reasons?: string[] }>;
  tokenCount: number;
}

export function buildContextPackMarkdown(pkg: ContextPackage, task: string): string {
  const fileBlock = pkg.files
    .map((f) => `### ${f.path} (relevance: ${f.score})\n\`\`\`\n${f.excerpt}\n\`\`\``)
    .join('\n\n');

  const symbolBlock = pkg.symbols.length
    ? `## Symbols\n${pkg.symbols.map((s) => `- \`${s.name}\` (${s.kind}) in \`${s.file}\`${s.line ? `:${s.line}` : ''}`).join('\n')}`
    : '';

  return [
    `# Context Pack`,
    ``,
    `**Task:** ${task}`,
    ``,
    `## Repository Overview`,
    pkg.repoSummary,
    symbolBlock,
    `## Relevant Files`,
    fileBlock || '_No files matched._',
    ``,
    `_Estimated tokens: ${pkg.estimatedTokens}_`,
  ].filter(Boolean).join('\n');
}

export function buildContextPackOutput(
  pkg: ContextPackage,
  task: string,
  repoPath: string,
  files: Array<{ path: string; score: number; reasons?: string[] }>,
): ContextPackOutput {
  const markdown = buildContextPackMarkdown(pkg, task);
  return {
    task,
    repoPath,
    markdown,
    package: pkg,
    files,
    tokenCount: countTokens(markdown),
  };
}
