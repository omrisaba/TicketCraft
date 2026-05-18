import type { GeminiModel } from './session.js';

export interface AdminSettings {
  defaultModel: GeminiModel;
  defaultTemperature: number;
  scanJql: string;
  githubMcpUrl: string;
  gitlabMcpUrl: string;
  mcpMaxRounds: number;
  mcpMaxToolCalls: number;
  cursorEnabled: boolean;
  cursorModel: string;
  cursorMaxConcurrent: number;
}
