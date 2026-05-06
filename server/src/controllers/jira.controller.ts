import type { Request, Response, NextFunction } from 'express';
import { getCredentials, getParam } from '../types/index.js';
import { JiraClient } from '../services/jira/JiraClient.js';
import { AppError } from '../middleware/errorHandler.js';

export class JiraController {
  private getClient(req: Request): JiraClient {
    const { jiraBaseUrl, jiraEmail, jiraApiToken } = getCredentials(req);
    return new JiraClient(jiraBaseUrl, jiraEmail, jiraApiToken);
  }

  getTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = getParam(req, 'ticketKey');
      if (!ticketKey || !/^[A-Z][A-Z0-9]+-\d+$/i.test(ticketKey)) {
        throw new AppError(400, 'INVALID_TICKET_KEY', `Invalid ticket key format: ${ticketKey}`);
      }

      const client = this.getClient(req);
      const ticket = await client.getTicket(ticketKey.toUpperCase());

      res.json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  };

  getLinkedTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = getParam(req, 'ticketKey');
      const client = this.getClient(req);
      const linked = await client.getLinkedTickets(ticketKey.toUpperCase());

      res.json({ success: true, data: linked });
    } catch (err) {
      next(err);
    }
  };

  updateTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = getParam(req, 'ticketKey');
      const changes = req.body;

      const client = this.getClient(req);
      await client.updateTicket(ticketKey.toUpperCase(), changes);

      res.json({ success: true, data: { message: 'Ticket updated successfully' } });
    } catch (err) {
      next(err);
    }
  };

  createTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectKey, issueType, changes, parentKey, linkToOriginal, originalKey } = req.body;

      if (!projectKey || !changes?.summary) {
        throw new AppError(400, 'INVALID_CREATE', 'projectKey and changes.summary are required.');
      }

      const client = this.getClient(req);
      const created = await client.createTicket({
        projectKey,
        issueType: issueType || 'Task',
        changes,
        parentKey,
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
    } catch (err) {
      next(err);
    }
  };

  uploadAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketKey = getParam(req, 'ticketKey');
      const { filename, content, mimeType } = req.body;

      if (!filename || !content) {
        throw new AppError(400, 'INVALID_ATTACHMENT', 'Filename and content are required');
      }

      const client = this.getClient(req);
      const fileBuffer = Buffer.from(content, 'base64');
      await client.uploadAttachment(ticketKey.toUpperCase(), fileBuffer, filename, mimeType || 'application/octet-stream');

      res.json({ success: true, data: { message: 'Attachment uploaded successfully' } });
    } catch (err) {
      next(err);
    }
  };
}
