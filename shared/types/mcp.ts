export interface McpToolCallInfo {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  reasoning?: string;
}

export interface McpUsageStats {
  used: boolean;
  provider: 'github' | 'gitlab';
  toolsAvailable: number;
  roundsUsed: number;
  toolCallsMade: number;
  elapsedMs: number;
  calls: McpToolCallInfo[];
}
