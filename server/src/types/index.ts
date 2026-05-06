import type { Request } from 'express';
import type { GeminiModel } from 'ticketcraft-shared';

export interface RequestCredentials {
  geminiApiKey: string;
  geminiModel: GeminiModel;
  geminiTemperature: number;
  jiraEmail: string;
  jiraApiToken: string;
  jiraBaseUrl: string;
  githubToken?: string;
  gitlabToken?: string;
}

export interface AuthenticatedRequest extends Request {
  credentials: RequestCredentials;
}

export function getCredentials(req: Request): RequestCredentials {
  return (req as AuthenticatedRequest).credentials;
}

export function getParam(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}
