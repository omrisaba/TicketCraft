import type { Request, Response, NextFunction } from 'express';
import type { TicketChanges } from 'ticketcraft-shared';
import { getCredentials, getParam } from '../types/index.js';
import { JiraClient } from '../services/jira/JiraClient.js';
import { AppError } from '../middleware/errorHandler.js';
import { usageTracker } from '../services/usage/UsageTracker.js';

export class JiraController {
  private getClient(req: Request): JiraClient {
    const { jiraBaseUrl, jiraEmail, jiraApiToken } = getCredentials(req);
    return new JiraClient(jiraBaseUrl, jiraEmail, jiraApiToken);
  }

  getTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = JiraController.validateTicketKey(getParam(req, 'ticketKey'));

      const client = this.getClient(req);
      const ticket = await client.getTicket(ticketKey);

      res.json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  };

  private static validateTicketKey(raw: string): string {
    if (!raw || !/^[A-Z][A-Z0-9]+-\d+$/i.test(raw)) {
      throw new AppError(400, 'INVALID_TICKET_KEY', `Invalid ticket key format: ${raw}`);
    }
    return raw.toUpperCase();
  }

  getLinkedTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = JiraController.validateTicketKey(getParam(req, 'ticketKey'));
      const client = this.getClient(req);
      const linked = await client.getLinkedTickets(ticketKey);

      res.json({ success: true, data: linked });
    } catch (err) {
      next(err);
    }
  };

  private static pickTicketChanges(raw: Record<string, unknown>): TicketChanges {
    const changes: TicketChanges = {};
    if (raw.summary !== undefined && typeof raw.summary === 'string' && raw.summary.trim()) {
      changes.summary = raw.summary;
    }
    if (raw.description !== undefined && typeof raw.description === 'string') {
      changes.description = raw.description;
    }
    if (raw.acceptanceCriteria !== undefined && typeof raw.acceptanceCriteria === 'string') {
      changes.acceptanceCriteria = raw.acceptanceCriteria;
    }
    if (raw.labels !== undefined && Array.isArray(raw.labels)) {
      changes.labels = raw.labels.filter((l): l is string => typeof l === 'string');
    }
    if (raw.storyPoints !== undefined && (typeof raw.storyPoints === 'number' || raw.storyPoints === null)) {
      changes.storyPoints = raw.storyPoints as number;
    }
    return changes;
  }

  updateTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = JiraController.validateTicketKey(getParam(req, 'ticketKey'));
      const changes = JiraController.pickTicketChanges(req.body);

      if (Object.keys(changes).length === 0) {
        throw new AppError(400, 'INVALID_UPDATE', 'No valid fields provided for update.');
      }

      const expectedUpdated = typeof req.body.expectedUpdated === 'string' ? req.body.expectedUpdated : undefined;
      const client = this.getClient(req);
      await client.updateTicket(ticketKey, changes, expectedUpdated);

      res.json({ success: true, data: { message: 'Ticket updated successfully' } });
      usageTracker.record(getCredentials(req).jiraEmail, 'sync_to_jira', ticketKey)
        .catch((err) => console.warn('[USAGE] sync_to_jira record failed:', (err as Error).message));
    } catch (err) {
      next(err);
    }
  };

  createTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectKey, issueType, changes, parentKey, linkToOriginal, originalKey, assigneeAccountId } = req.body;

      if (!projectKey || !changes?.summary) {
        throw new AppError(400, 'INVALID_CREATE', 'projectKey and changes.summary are required.');
      }

      const client = this.getClient(req);
      const created = await client.createTicket({
        projectKey,
        issueType: issueType || 'Task',
        changes,
        parentKey,
        assigneeAccountId,
      });

      if (linkToOriginal && originalKey) {
        try {
          await client.linkTickets(created.key, originalKey, 'Relates');
        } catch { /* linking is best-effort */ }

        try {
          await client.addComment(
            originalKey,
            `An improved version of this ticket was created by TicketCraft: **${created.key}**`,
          );
        } catch { /* comment is best-effort */ }
      }

      res.json({ success: true, data: { key: created.key, id: created.id } });
      usageTracker.record(getCredentials(req).jiraEmail, 'create_in_jira', created.key)
        .catch((err) => console.warn('[USAGE] create_in_jira record failed:', (err as Error).message));
    } catch (err) {
      next(err);
    }
  };

  getProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.query.query as string | undefined)?.trim() || undefined;
      const client = this.getClient(req);
      const projects = await client.getProjects(query);
      res.json({ success: true, data: projects });
    } catch (err) {
      next(err);
    }
  };

  getIssueTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectKey = getParam(req, 'projectKey');
      if (!projectKey) {
        throw new AppError(400, 'INVALID_PROJECT', 'projectKey is required.');
      }
      const client = this.getClient(req);
      const types = await client.getIssueTypes(projectKey.toUpperCase());
      res.json({ success: true, data: types });
    } catch (err) {
      next(err);
    }
  };

  getAssignableUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectKey = getParam(req, 'projectKey');
      if (!projectKey) {
        throw new AppError(400, 'INVALID_PROJECT', 'projectKey is required.');
      }
      const query = (req.query.query as string | undefined)?.trim() || undefined;
      const client = this.getClient(req);
      const users = await client.getAssignableUsers(projectKey.toUpperCase(), query);
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  };

  batchCreateTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { parentTicket, subtasks } = req.body;

      if (!parentTicket?.projectKey || !parentTicket?.changes?.summary) {
        throw new AppError(400, 'INVALID_BATCH_CREATE', 'parentTicket with projectKey and changes.summary is required.');
      }
      if (!Array.isArray(subtasks) || subtasks.length === 0) {
        throw new AppError(400, 'INVALID_BATCH_CREATE', 'At least one subtask is required.');
      }
      if (subtasks.length > 20) {
        throw new AppError(400, 'INVALID_BATCH_CREATE', 'Maximum 20 subtasks per batch.');
      }

      const client = this.getClient(req);
      const result = await client.batchCreateTickets({ parentTicket, subtasks });
      res.json({ success: true, data: result });
      const email = getCredentials(req).jiraEmail;
      const batchId = `batch_${Date.now()}`;
      const warn = (err: unknown) =>
        console.warn('[USAGE] create_in_jira record failed:', (err as Error).message);
      if (result.parent?.key) {
        usageTracker.record(email, 'create_in_jira', result.parent.key, { batchId }).catch(warn);
      }
      for (const st of result.subtasks || []) {
        if (st.key) usageTracker.record(email, 'create_in_jira', st.key, { batchId }).catch(warn);
      }
    } catch (err) {
      next(err);
    }
  };

  private static readonly MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB decoded
  private static readonly MIME_RE = /^[\w.+\-]+\/[\w.+\-]+$/;

  uploadAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = JiraController.validateTicketKey(getParam(req, 'ticketKey'));
      const { filename, content, mimeType } = req.body;

      if (!filename || typeof filename !== 'string') {
        throw new AppError(400, 'INVALID_ATTACHMENT', 'Filename is required.');
      }
      if (!content || typeof content !== 'string') {
        throw new AppError(400, 'INVALID_ATTACHMENT', 'Base64 content is required.');
      }
      if (filename.length > 255) {
        throw new AppError(400, 'INVALID_ATTACHMENT', 'Filename must be 255 characters or fewer.');
      }

      const safeMime = (typeof mimeType === 'string' && JiraController.MIME_RE.test(mimeType))
        ? mimeType
        : 'application/octet-stream';

      const fileBuffer = Buffer.from(content, 'base64');
      if (fileBuffer.length > JiraController.MAX_ATTACHMENT_BYTES) {
        throw new AppError(400, 'ATTACHMENT_TOO_LARGE', `Attachment exceeds ${JiraController.MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`);
      }

      const client = this.getClient(req);
      await client.uploadAttachment(ticketKey, fileBuffer, filename, safeMime);

      res.json({ success: true, data: { message: 'Attachment uploaded successfully' } });
    } catch (err) {
      next(err);
    }
  };
}
