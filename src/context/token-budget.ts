import { getEncoding } from 'js-tiktoken';

const encoder = getEncoding('cl100k_base');

export interface TokenBudgetConfig {
  total: number;
  systemPrefix: number;
  repoSummary: number;
  files: number;
  history: number;
  userTask: number;
}

export function defaultTokenBudget(total = 32000): TokenBudgetConfig {
  return {
    total,
    systemPrefix: Math.floor(total * 0.15),
    repoSummary: Math.floor(total * 0.10),
    files: Math.floor(total * 0.50),
    history: Math.floor(total * 0.15),
    userTask: Math.floor(total * 0.10),
  };
}

export function countTokens(text: string): number {
  return encoder.encode(text).length;
}

export function countMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const tokens = encoder.encode(text);
  if (tokens.length <= maxTokens) return text;
  const truncated = encoder.decode(tokens.slice(0, maxTokens));
  return truncated + '\n...[token budget exceeded]';
}

export interface BudgetAllocation {
  section: string;
  allocated: number;
  used: number;
  content: string;
}

export function allocateBudget(
  sections: Array<{ name: string; content: string; maxTokens: number }>,
  totalBudget: number,
): { sections: BudgetAllocation[]; totalUsed: number; withinBudget: boolean } {
  const allocations: BudgetAllocation[] = [];
  let totalUsed = 0;

  for (const section of sections) {
    const used = Math.min(countTokens(section.content), section.maxTokens);
    const content =
      used < countTokens(section.content)
        ? truncateToTokenBudget(section.content, section.maxTokens)
        : section.content;
    allocations.push({
      section: section.name,
      allocated: section.maxTokens,
      used,
      content,
    });
    totalUsed += used;
  }

  return {
    sections: allocations,
    totalUsed,
    withinBudget: totalUsed <= totalBudget,
  };
}
