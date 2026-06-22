import type { AppConfig } from '../core/config.js';
import type { Logger } from '../observability/logger.js';
import type { ChatRequest, ChatResponse } from '../core/schemas/index.js';
import { HybridRetriever } from '../context/retriever.js';
import { PromptBuilder } from '../context/prompt-builder.js';
import { buildRepoMap } from '../context/repo-map.js';
import { ModelRouter } from '../models/router.js';
import { createSandbox } from '../tools/sandbox.js';
import { countTokens } from '../context/token-budget.js';

export class ChatService {
  private modelRouter: ModelRouter;
  private retriever: HybridRetriever;
  private promptBuilder: PromptBuilder;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.modelRouter = new ModelRouter(config);
    this.retriever = new HybridRetriever();
    this.promptBuilder = new PromptBuilder();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    createSandbox(request.repoPath, this.config);

    const repoMap = await buildRepoMap(request.repoPath);
    const retrieval = await this.retriever.retrieve(request.repoPath, request.prompt, 5);

    const contextPackage = await this.promptBuilder.buildContextPackage({
      repoMap,
      task: request.prompt,
      rankedFiles: retrieval.files,
      symbols: retrieval.symbols,
    });

    const messages = this.promptBuilder.buildMessages(contextPackage, request.prompt);
    const adapter = this.modelRouter.getAdapter('default');

    let answer: string;
    let inputTokens = countTokens(messages.map((m) => m.content).join('\n'));
    let outputTokens = 0;

    if (this.modelRouter.hasRemoteModel()) {
      try {
        const response = await adapter.complete(messages, { maxTokens: 2000 });
        answer = response.content ?? 'No response from model.';
        inputTokens = response.usage?.input ?? inputTokens;
        outputTokens = response.usage?.output ?? countTokens(answer);
      } catch (err) {
        this.logger.warn({ err }, 'Model call failed, using retrieval summary');
        answer = this.fallbackAnswer(contextPackage, request.prompt);
        outputTokens = countTokens(answer);
      }
    } else {
      answer = this.fallbackAnswer(contextPackage, request.prompt);
      outputTokens = countTokens(answer);
    }

    return {
      answer,
      contextFiles: contextPackage.files.map((f) => f.path),
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
    };
  }

  private fallbackAnswer(
    pkg: Awaited<ReturnType<PromptBuilder['buildContextPackage']>>,
    prompt: string,
  ): string {
    const fileList = pkg.files.map((f) => `- ${f.path} (score: ${f.score})`).join('\n');
    const symbolList = pkg.symbols.map((s) => `- ${s.name} in ${s.file}`).join('\n');
    return `## Context for: ${prompt}\n\n### Repository\n${pkg.repoSummary}\n\n### Relevant Files\n${fileList || 'None found'}\n\n### Symbols\n${symbolList || 'None found'}\n\n*Configure GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY for AI-generated explanations.*`;
  }
}
