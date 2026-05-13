export interface SessionCredentials {
  geminiModel: GeminiModel;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken?: string;
  gitlabToken?: string;
  cursorApiKey?: string;
}

export type GeminiModel =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3-flash-preview';

export const AVAILABLE_MODELS: { id: GeminiModel; label: string }[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash' },
];

export const DEFAULT_MODEL: GeminiModel = 'gemini-3.1-pro-preview';

export interface SessionValidationResult {
  valid: boolean;
  jiraUser?: {
    displayName: string;
    emailAddress: string;
    avatarUrl: string | null;
  };
  errors: string[];
}

export interface AppConfig {
  jiraBaseUrl: string;
  defaultModel: GeminiModel;
  defaultTemperature: number;
  availableModels: { id: GeminiModel; label: string }[];
  githubMcpUrl: string;
  gitlabMcpUrl: string;
  mcpMaxRounds: number;
  mcpMaxToolCalls: number;
  cursorEnabled: boolean;
  adminEmails: string[];
}
