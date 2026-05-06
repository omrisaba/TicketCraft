import type { Request, Response, NextFunction } from 'express';
import type { Ticket, McpUsageStats, TicketTemplateType } from 'ticketcraft-shared';
import { SKILLS_MARKDOWN_MAX_CHARS } from 'ticketcraft-shared';
import { getCredentials } from '../types/index.js';
import { GeminiAdapter } from '../services/ai/GeminiAdapter.js';
import { CursorAdapter } from '../services/ai/CursorAdapter.js';
import { AdminStore } from '../services/admin/AdminStore.js';
import { McpAgent } from '../services/mcp/McpAgent.js';
import { RepoService } from '../services/repo/RepoService.js';
import { RepoCloneStore } from '../services/repo/RepoCloneStore.js';
import { AppError } from '../middleware/errorHandler.js';

interface McpEnrichResult {
  prompt: string | undefined;
  mcpStats: McpUsageStats | null;
}

let cursorActiveCount = 0;

function parseSkillsMarkdown(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const raw = (body as Record<string, unknown>).skillsMarkdown;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new AppError(400, 'SKILLS_INVALID', 'skillsMarkdown must be a string.');
  }
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (trimmed.length > SKILLS_MARKDOWN_MAX_CHARS) {
    throw new AppError(
      400,
      'SKILLS_TOO_LARGE',
      `skillsMarkdown must be at most ${SKILLS_MARKDOWN_MAX_CHARS} characters (after trimming).`,
    );
  }
  return trimmed;
}

export class AIController {
  private getAI(req: Request): GeminiAdapter {
    const { geminiApiKey, geminiModel, geminiTemperature } = getCredentials(req);
    return new GeminiAdapter(geminiApiKey, geminiModel, geminiTemperature);
  }

  /**
   * If an MCP URL is configured and a repo is connected, run the agentic
   * loop to fetch deeper context, then append it to the base prompt.
   */
  private async enrichWithMcpFromReq(
    req: Request,
    ticket: Ticket,
    repoUrl: string | undefined,
    basePrompt: string | undefined,
  ): Promise<McpEnrichResult> {
    if (!repoUrl) return { prompt: basePrompt, mcpStats: null };

    const admin = await AdminStore.load();
    let parsed: { provider: string; owner: string; repo: string };
    try {
      parsed = RepoService.parseRepoUrl(repoUrl);
    } catch {
      return { prompt: basePrompt, mcpStats: null };
    }

    const mcpUrl = parsed.provider === 'github' ? admin.githubMcpUrl : admin.gitlabMcpUrl;
    if (!mcpUrl) return { prompt: basePrompt, mcpStats: null };

    const creds = getCredentials(req);
    const authToken = parsed.provider === 'github' ? creds.githubToken : creds.gitlabToken;

    try {
      const agent = new McpAgent(mcpUrl, {
        geminiApiKey: creds.geminiApiKey,
        geminiModel: creds.geminiModel,
        temperature: creds.geminiTemperature,
        maxRounds: admin.mcpMaxRounds,
        maxToolCalls: admin.mcpMaxToolCalls,
        repoOwner: parsed.owner,
        repoName: parsed.repo,
        authToken,
      });
      const { context, stats } = await agent.gatherContext(ticket);
      stats.provider = parsed.provider as 'github' | 'gitlab';
      if (context) {
        return { prompt: (basePrompt || '') + context, mcpStats: stats };
      }
      return { prompt: basePrompt, mcpStats: stats };
    } catch (err) {
      console.error('[MCP] Agentic loop error (best-effort):', (err as Error).message);
    }

    return { prompt: basePrompt, mcpStats: null };
  }

  score = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, linkedTickets, repoContextPrompt, referenceContent, repoUrl } = req.body;
      const { prompt: enrichedPrompt, mcpStats } = await this.enrichWithMcpFromReq(req, ticket, repoUrl, repoContextPrompt);
      const ai = this.getAI(req);
      const score = await ai.scoreTicket(ticket, linkedTickets, enrichedPrompt, referenceContent);

      res.json({ success: true, data: { ...score, mcpStats } });
    } catch (err) {
      next(err);
    }
  };

  improve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, templateType, userAnswers, linkedTickets, repoContextPrompt, referenceContent, repoUrl, useCursor } = req.body;
      const skillsMarkdown = parseSkillsMarkdown(req.body);

      const improveBase = {
        templateType,
        userAnswers,
        linkedTickets,
        referenceContent,
        skillsMarkdown,
      };

      if (useCursor) {
        const result = await this.improveWithCursor(req, ticket, repoUrl, improveBase);
        res.json({ success: true, data: result });
        return;
      }

      const { prompt: enrichedPrompt, mcpStats } = await this.enrichWithMcpFromReq(req, ticket, repoUrl, repoContextPrompt);
      const ai = this.getAI(req);
      const result = await ai.improveTicket(ticket, {
        ...improveBase,
        repoContextPrompt: enrichedPrompt,
      });

      res.json({ success: true, data: { ...result, mcpStats } });
    } catch (err) {
      next(err);
    }
  };

  private async improveWithCursor(
    req: Request,
    ticket: Ticket,
    repoUrl: string | undefined,
    options: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      referenceContent?: string;
      skillsMarkdown?: string;
    },
  ) {
    const admin = await AdminStore.load();
    if (!admin.cursorEnabled || !admin.cursorApiKey) {
      throw new AppError(400, 'CURSOR_DISABLED', 'Cursor integration is not enabled. Configure it in admin settings.');
    }

    if (!repoUrl) {
      throw new AppError(400, 'CURSOR_NO_REPO', 'Cursor requires a connected repository. Please connect a repo first.');
    }

    if (cursorActiveCount >= admin.cursorMaxConcurrent) {
      // Fallback to Gemini
      const { geminiApiKey, geminiModel, geminiTemperature } = getCredentials(req);
      const ai = new GeminiAdapter(geminiApiKey, geminiModel, geminiTemperature);
      const result = await ai.improveTicket(ticket, options);
      return { ...result, cursorFallback: true, codeInsights: null };
    }

    const creds = getCredentials(req);
    const parsed = RepoService.parseRepoUrl(repoUrl);
    const token = parsed.provider === 'github' ? creds.githubToken : creds.gitlabToken;

    const repoDir = await RepoCloneStore.ensureClone(repoUrl, token);
    const cursor = new CursorAdapter(admin.cursorApiKey, admin.cursorModel, repoDir);

    cursorActiveCount++;
    try {
      const result = await cursor.improveTicket(ticket, options);
      return { ...result, cursorFallback: false };
    } finally {
      cursorActiveCount--;
    }
  }

  generateQuestions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, weakDimensions, repoContextPrompt, referenceContent, repoUrl } = req.body;
      const { prompt: enrichedPrompt } = await this.enrichWithMcpFromReq(req, ticket, repoUrl, repoContextPrompt);
      const ai = this.getAI(req);
      const questions = await ai.generateGuidingQuestions(ticket, weakDimensions, enrichedPrompt, referenceContent);

      res.json({ success: true, data: { questions } });
    } catch (err) {
      next(err);
    }
  };

  enrich = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, userAnswers, templateType, linkedTickets, repoContextPrompt, referenceContent, repoUrl } = req.body;
      const skillsMarkdown = parseSkillsMarkdown(req.body);
      const { prompt: enrichedPrompt, mcpStats } = await this.enrichWithMcpFromReq(req, ticket, repoUrl, repoContextPrompt);
      const ai = this.getAI(req);
      const result = await ai.improveTicket(ticket, {
        templateType,
        userAnswers,
        linkedTickets,
        repoContextPrompt: enrichedPrompt,
        referenceContent,
        skillsMarkdown,
      });

      res.json({ success: true, data: { ...result, mcpStats } });
    } catch (err) {
      next(err);
    }
  };

  annotate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { original, improved } = req.body;
      const ai = this.getAI(req);
      const annotations = await ai.annotateChanges(original, improved);

      res.json({ success: true, data: { annotations } });
    } catch (err) {
      next(err);
    }
  };

  refine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, currentImprovements, instruction, conversationHistory, repoContextPrompt, referenceContent } = req.body;
      const ai = this.getAI(req);
      const result = await ai.refineTicket(ticket, currentImprovements, instruction, conversationHistory || [], repoContextPrompt, referenceContent);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  repoUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { improvedTicket, repoContextPrompt } = req.body;
      const ai = this.getAI(req);
      const usage = await ai.explainRepoUsage(improvedTicket, repoContextPrompt);

      res.json({ success: true, data: usage });
    } catch (err) {
      next(err);
    }
  };

  generateDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, docType } = req.body;
      const ai = this.getAI(req);
      const doc = await ai.generateDocument(ticket, docType);

      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  };
}
