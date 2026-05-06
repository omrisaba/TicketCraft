import type { Request, Response, NextFunction } from 'express';
import type { GeminiModel } from 'ticketcraft-shared';
import { AVAILABLE_MODELS } from 'ticketcraft-shared';
import { config } from '../config/index.js';
import { JiraClient } from '../services/jira/JiraClient.js';
import { GeminiAdapter } from '../services/ai/GeminiAdapter.js';
import { AdminStore } from '../services/admin/AdminStore.js';

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m: { id: string }) => m.id));

export class SessionController {
  validate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jiraEmail, jiraApiToken, geminiModel } = req.body;

      const errors: string[] = [];

      if (!jiraEmail?.trim()) errors.push('Jira email is required');
      if (!jiraApiToken?.trim()) errors.push('Jira API token is required');
      if (geminiModel && !VALID_MODEL_IDS.has(geminiModel)) {
        errors.push(`Invalid model: ${geminiModel}`);
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.join('; ') },
        });
        return;
      }

      const validationErrors: string[] = [];
      let jiraUser = undefined;

      try {
        const jiraClient = new JiraClient(
          config.jira.baseUrl,
          jiraEmail.trim(),
          jiraApiToken.trim(),
        );
        const user = await jiraClient.validateCredentials();
        jiraUser = {
          displayName: user.displayName,
          emailAddress: user.emailAddress,
          avatarUrl: user.avatarUrl,
        };
      } catch {
        validationErrors.push('Jira authentication failed. Check your email and API token.');
      }

      const valid = validationErrors.length === 0;

      res.json({
        success: true,
        data: {
          valid,
          jiraUser,
          errors: validationErrors,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminSettings = await AdminStore.load();
      res.json({
        success: true,
        data: {
          jiraBaseUrl: config.jira.baseUrl,
          defaultModel: adminSettings.defaultModel,
          defaultTemperature: adminSettings.defaultTemperature,
          availableModels: AVAILABLE_MODELS,
          githubMcpUrl: adminSettings.githubMcpUrl,
          gitlabMcpUrl: adminSettings.gitlabMcpUrl,
          mcpMaxRounds: adminSettings.mcpMaxRounds,
          mcpMaxToolCalls: adminSettings.mcpMaxToolCalls,
          cursorEnabled: adminSettings.cursorEnabled,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
