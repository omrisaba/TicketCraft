export interface SessionCredentials {
  geminiModel: GeminiModel;
  jiraEmail: string;
  jiraApiToken: string;
  geminiApiKey?: string;
  githubToken?: string;
  gitlabToken?: string;
  cursorApiKey?: string;
}

export type GeminiModel =
  | 'gemini-3.8-flash'
  | 'gemini-3.7-flash';

export const AVAILABLE_MODELS: { id: GeminiModel; label: string }[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
];

export const DEFAULT_MODEL: GeminiModel = 'gemini-3.8-flash';

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
  geminiServerKeyConfigured: boolean;
}
