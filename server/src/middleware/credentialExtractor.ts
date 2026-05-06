import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import type { GeminiModel } from 'ticketcraft-shared';
import { AVAILABLE_MODELS } from 'ticketcraft-shared';
import { config } from '../config/index.js';

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m: { id: string }) => m.id));

export function credentialExtractor(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const jiraEmail = req.headers['x-jira-email'] as string | undefined;
  const jiraApiToken = req.headers['x-jira-token'] as string | undefined;
  const geminiModel = req.headers['x-gemini-model'] as string | undefined;
  const tempHeader = req.headers['x-gemini-temperature'] as string | undefined;
  const githubToken = req.headers['x-github-token'] as string | undefined;
  const gitlabToken = req.headers['x-gitlab-token'] as string | undefined;

  const errors: string[] = [];

  if (!jiraEmail?.trim()) errors.push('Missing X-Jira-Email header');
  if (!jiraApiToken?.trim()) errors.push('Missing X-Jira-Token header');

  if (geminiModel && !VALID_MODEL_IDS.has(geminiModel)) {
    errors.push(`Invalid model: ${geminiModel}. Valid models: ${[...VALID_MODEL_IDS].join(', ')}`);
  }

  let temperature = 0.3;
  if (tempHeader != null) {
    const parsed = parseFloat(tempHeader);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      temperature = Math.round(parsed * 10) / 10;
    }
  }

  if (errors.length > 0) {
    res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_CREDENTIALS',
        message: 'Required credentials not provided.',
        details: errors.join('; '),
      },
    });
    return;
  }

  (req as AuthenticatedRequest).credentials = {
    geminiApiKey: config.gemini.apiKey,
    geminiModel: (geminiModel as GeminiModel) || (config.gemini.defaultModel as GeminiModel),
    geminiTemperature: temperature,
    jiraEmail: jiraEmail!.trim(),
    jiraApiToken: jiraApiToken!.trim(),
    jiraBaseUrl: config.jira.baseUrl,
    ...(githubToken?.trim() && { githubToken: githubToken.trim() }),
    ...(gitlabToken?.trim() && { gitlabToken: gitlabToken.trim() }),
  };

  next();
}
