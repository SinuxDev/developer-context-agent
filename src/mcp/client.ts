/**
 * MCP client stub for future external MCP tool integrations.
 * Will connect to external MCP servers and expose their tools to the agent runtime.
 */
export interface McpClientConfig {
  serverCommand: string;
  serverArgs?: string[];
}

export class McpClientStub {
  constructor(private readonly _config: McpClientConfig) {}

  async listTools(): Promise<string[]> {
    return [];
  }

  async callTool(_name: string, _args: Record<string, unknown>): Promise<unknown> {
    throw new Error('MCP client not yet implemented');
  }
}
