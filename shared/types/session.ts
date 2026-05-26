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
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash';

export const AVAILABLE_MODELS: { id: GeminiModel; label: string }[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
];

export const DEFAULT_MODEL: GeminiModel = 'gemini-3.5-flash';

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
  githubMcpConfigured: boolean;
  gitlabMcpConfigured: boolean;
  cursorEnabled: boolean;
  adminPortalEnabled: boolean;
}
