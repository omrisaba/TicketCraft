import type { Request, Response, NextFunction } from 'express';
import type { AutomationResult, Ticket } from 'ticketcraft-shared';
import { getCredentials } from '../types/index.js';
import { config } from '../config/index.js';
import { AutomationStore } from '../services/automation/AutomationStore.js';
import { AdminStore } from '../services/admin/AdminStore.js';
import { JiraClient } from '../services/jira/JiraClient.js';
import { GeminiAdapter } from '../services/ai/GeminiAdapter.js';
import { RepoService } from '../services/repo/RepoService.js';
import { McpAgent } from '../services/mcp/McpAgent.js';
import { AppError } from '../middleware/errorHandler.js';

export class AutomationController {
  static readonly BASE_JQL_CLAUSES = [
    'reporter = currentUser()',
    'labels = "readyForTicketCraftRefinement"',
  ] as const;

  private static buildJql(extraJql?: string): string {
    const base: string[] = [...AutomationController.BASE_JQL_CLAUSES];
    const extra = extraJql?.trim();
    if (extra) base.push(`(${extra})`);
    return base.join(' AND ');
  }

  /** Express may type params as string | string[] */
  private static singleRouteParam(raw: string | string[] | undefined): string | undefined {
    const v = Array.isArray(raw) ? raw[0] : raw;
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? undefined : s;
  }

  info = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          triggerLabel: config.automation.triggerLabel,
          doneLabel: config.automation.doneLabel,
          baseClauses: AutomationController.BASE_JQL_CLAUSES,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  scan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const creds = getCredentials(req);
      const jira = new JiraClient(creds.jiraBaseUrl, creds.jiraEmail, creds.jiraApiToken);
      const ai = new GeminiAdapter(creds.geminiApiKey, creds.geminiModel, creds.geminiTemperature);

      const adminCfg = await AdminStore.load();
      const jql = adminCfg.scanJql || AutomationController.buildJql();
      const ticketKeys = await jira.searchByJql(jql);

      if (ticketKeys.length === 0) {
        res.json({ success: true, data: { found: 0, processed: 0, skipped: 0 } });
        return;
      }

      let repoContextPrompt: string | undefined;
      const profile = await AutomationStore.loadProfile(creds.jiraEmail);
      if (profile.repoUrl) {
        try {
          const repoCtx = await RepoService.fetchContext(profile.repoUrl);
          repoContextPrompt = RepoService.formatContextForPrompt(repoCtx);
        } catch { /* repo context is best-effort */ }
      }

      let mcpParsed: { provider: string; owner: string; repo: string } | null = null;
      let mcpUrl: string | null = null;
      if (profile.repoUrl) {
        try {
          mcpParsed = RepoService.parseRepoUrl(profile.repoUrl);
          mcpUrl = (mcpParsed.provider === 'github' ? adminCfg.githubMcpUrl : adminCfg.gitlabMcpUrl) || null;
        } catch { /* ignore */ }
      }

      let processed = 0;
      let skipped = 0;

      for (const ticketKey of ticketKeys) {
        const alreadyDone = await AutomationStore.exists(creds.jiraEmail, ticketKey);
        if (alreadyDone) {
          skipped++;
          continue;
        }

        try {
          const ticket: Ticket = await jira.getTicket(ticketKey);

          let enrichedPrompt = repoContextPrompt;
          if (mcpUrl && mcpParsed) {
            try {
              const authToken = mcpParsed.provider === 'github' ? creds.githubToken : creds.gitlabToken;
              const agent = new McpAgent(mcpUrl, {
                geminiApiKey: creds.geminiApiKey,
                geminiModel: creds.geminiModel,
                temperature: creds.geminiTemperature,
                maxRounds: adminCfg.mcpMaxRounds,
                maxToolCalls: adminCfg.mcpMaxToolCalls,
                repoOwner: mcpParsed.owner,
                repoName: mcpParsed.repo,
                authToken,
              });
              const mcpResult = await agent.gatherContext(ticket);
              if (mcpResult.context) enrichedPrompt = (enrichedPrompt || '') + mcpResult.context;
            } catch (mcpErr) {
              console.error(`[AUTOMATION/MCP] Best-effort MCP failed for ${ticketKey}:`, (mcpErr as Error).message);
            }
          }

          const score = await ai.scoreTicket(ticket, undefined, enrichedPrompt);
          const result = await ai.improveTicket(ticket, { repoContextPrompt: enrichedPrompt });
          const improvements = result.improvedTicket;

          let annotations: AutomationResult['annotations'] = [];
          try {
            annotations = await ai.annotateChanges(ticket, improvements);
          } catch { /* best-effort */ }

          const automationResult: AutomationResult = {
            ticketKey,
            reporterEmail: creds.jiraEmail,
            reporterName: ticket.reporter || 'Unknown',
            ticket,
            score,
            improvements,
            annotations,
            processedAt: new Date().toISOString(),
          };

          await AutomationStore.save(creds.jiraEmail, automationResult);

          try {
            await jira.swapLabels(ticketKey, config.automation.triggerLabel, config.automation.doneLabel);
          } catch { /* label swap is best-effort */ }

          processed++;
        } catch (err) {
          console.error(`[AUTOMATION] Failed to process ${ticketKey}:`, (err as Error).message);
        }
      }

      res.json({ success: true, data: { found: ticketKeys.length, processed, skipped } });
    } catch (err) {
      next(err);
    }
  };

  pending = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jiraEmail } = getCredentials(req);
      const items = await AutomationStore.listPending(jiraEmail);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  loadResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = AutomationController.singleRouteParam(req.params.ticketKey);
      if (!ticketKey) {
        throw new AppError(400, 'BAD_REQUEST', 'Missing or invalid ticket key.');
      }
      const { jiraEmail } = getCredentials(req);
      const result = await AutomationStore.load(jiraEmail, ticketKey);

      if (!result) {
        throw new AppError(404, 'NOT_FOUND', `No automation result for ${ticketKey}.`);
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  dismiss = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = AutomationController.singleRouteParam(req.params.ticketKey);
      if (!ticketKey) {
        throw new AppError(400, 'BAD_REQUEST', 'Missing or invalid ticket key.');
      }
      const { jiraEmail } = getCredentials(req);
      await AutomationStore.delete(jiraEmail, ticketKey);
      res.json({ success: true, data: { deleted: ticketKey } });
    } catch (err) {
      next(err);
    }
  };

  saveRepoUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jiraEmail } = getCredentials(req);
      const { repoUrl } = req.body;
      await AutomationStore.saveProfile(jiraEmail, { repoUrl: repoUrl || null });
      res.json({ success: true, data: { saved: true } });
    } catch (err) {
      next(err);
    }
  };

  loadRepoUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jiraEmail } = getCredentials(req);
      const profile = await AutomationStore.loadProfile(jiraEmail);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };
}
