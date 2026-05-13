import type { Request, Response, NextFunction } from 'express';
import { DraftStore } from '../services/draft/DraftStore.js';
import { AppError } from '../middleware/errorHandler.js';
import { getCredentials } from '../types/index.js';

export class DraftController {
  private getEmail(req: Request): string {
    return getCredentials(req).jiraEmail;
  }

  save = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const draft = req.body;

      if (!draft || !draft.ticketKey) {
        throw new AppError(400, 'INVALID_DRAFT', 'Draft must include a ticketKey.');
      }

      draft.savedAt = new Date().toISOString();
      await DraftStore.save(email, draft);

      res.json({ success: true, data: { message: 'Draft saved.' } });
    } catch (err) {
      next(err);
    }
  };

  load = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const draft = await DraftStore.load(email);

      res.json({ success: true, data: draft });
    } catch (err) {
      next(err);
    }
  };

  check = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const metadata = await DraftStore.getMetadata(email);

      res.json({ success: true, data: metadata });
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      await DraftStore.delete(email);

      res.json({ success: true, data: { message: 'Draft deleted.' } });
    } catch (err) {
      next(err);
    }
  };
}
