import type { Request, Response, NextFunction } from 'express';
import type { AdminSettings, GeminiModel } from 'ticketcraft-shared';
import { AVAILABLE_MODELS } from 'ticketcraft-shared';
import { getCredentials } from '../types/index.js';
import { AdminStore } from '../services/admin/AdminStore.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  logBuffer,
  type LogCategory,
  LOG_RETENTION_DAYS,
} from '../services/logging/LogBuffer.js';

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

function assertAdmin(req: Request): void {
  const { jiraEmail } = getCredentials(req);
  if (!ADMIN_EMAILS.has(jiraEmail.toLowerCase())) {
    throw new AppError(403, 'FORBIDDEN', 'Admin access required.');
  }
}

export class AdminController {
  load = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertAdmin(req);
      const settings = await AdminStore.load();
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  };

  save = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertAdmin(req);
      const { defaultModel, defaultTemperature, scanJql, githubMcpUrl, gitlabMcpUrl, mcpMaxRounds, mcpMaxToolCalls } = req.body;

      const errors: string[] = [];
      if (defaultModel && !VALID_MODEL_IDS.has(defaultModel)) {
        errors.push(`Invalid model: ${defaultModel}`);
      }
      if (defaultTemperature != null) {
        const t = parseFloat(defaultTemperature);
        if (isNaN(t) || t < 0 || t > 1) {
          errors.push('Temperature must be between 0.0 and 1.0');
        }
      }
      if (errors.length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', errors.join('; '));
      }

      const current = await AdminStore.load();
      const {
        cursorEnabled: cEnabled, cursorModel: cModel, cursorMaxConcurrent: cMax,
      } = req.body;

      const updated: AdminSettings = {
        defaultModel: (defaultModel as GeminiModel) || current.defaultModel,
        defaultTemperature: defaultTemperature != null ? Math.round(parseFloat(defaultTemperature) * 10) / 10 : current.defaultTemperature,
        scanJql: scanJql != null ? scanJql : current.scanJql,
        githubMcpUrl: githubMcpUrl != null ? githubMcpUrl.trim() : current.githubMcpUrl,
        gitlabMcpUrl: gitlabMcpUrl != null ? gitlabMcpUrl.trim() : current.gitlabMcpUrl,
        mcpMaxRounds: mcpMaxRounds != null ? Math.max(1, Math.min(20, parseInt(mcpMaxRounds, 10) || 5)) : current.mcpMaxRounds,
        mcpMaxToolCalls: mcpMaxToolCalls != null ? Math.max(1, Math.min(50, parseInt(mcpMaxToolCalls, 10) || 10)) : current.mcpMaxToolCalls,
        cursorEnabled: cEnabled != null ? !!cEnabled : current.cursorEnabled,
        cursorModel: cModel != null ? cModel.trim() || 'auto' : current.cursorModel,
        cursorMaxConcurrent: cMax != null ? Math.max(1, Math.min(30, parseInt(cMax, 10) || 8)) : current.cursorMaxConcurrent,
      };

      await AdminStore.save(updated);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  logs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertAdmin(req);
      const category = req.query.category as LogCategory | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const dateRaw = req.query.date as string | undefined;
      const date =
        dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim()) ? dateRaw.trim() : undefined;
      const { entries, stats } = logBuffer.query({ category, limit, date });
      res.json({
        success: true,
        data: { entries, stats, retentionDays: LOG_RETENTION_DAYS },
      });
    } catch (err) {
      next(err);
    }
  };

  cursorModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertAdmin(req);
      const { cursorApiKey } = getCredentials(req);
      if (!cursorApiKey) {
        res.json({ success: true, data: [] });
        return;
      }
      const { Cursor } = await import('@cursor/sdk');
      const models = await Cursor.models.list({ apiKey: cursorApiKey });
      res.json({ success: true, data: models });
    } catch (err) {
      next(err);
    }
  };

  clearLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertAdmin(req);
      logBuffer.clear();
      res.json({ success: true, data: { message: 'Logs cleared.' } });
    } catch (err) {
      next(err);
    }
  };
}
