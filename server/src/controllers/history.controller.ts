import type { Request, Response, NextFunction } from 'express';
import { HistoryStore } from '../services/history/HistoryStore.js';
import { AppError } from '../middleware/errorHandler.js';
import { getCredentials } from '../types/index.js';

export class HistoryController {
  private getEmail(req: Request): string {
    return getCredentials(req).jiraEmail;
  }

  save = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const snapshot = req.body;

      if (!snapshot?.id || !snapshot?.ticketKey) {
        throw new AppError(400, 'INVALID_SNAPSHOT', 'Snapshot must include id and ticketKey.');
      }

      snapshot.savedAt = new Date().toISOString();
      await HistoryStore.save(email, snapshot);

      res.json({ success: true, data: { message: 'Snapshot saved.' } });
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const items = await HistoryStore.list(email);

      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  load = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const id = req.params.id as string;

      if (!id) throw new AppError(400, 'MISSING_ID', 'Snapshot id is required.');

      const snapshot = await HistoryStore.load(email, id);
      if (!snapshot) throw new AppError(404, 'NOT_FOUND', 'Snapshot not found.');

      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const id = req.params.id as string;

      if (!id) throw new AppError(400, 'MISSING_ID', 'Snapshot id is required.');

      await HistoryStore.delete(email, id);
      res.json({ success: true, data: { message: 'Snapshot deleted.' } });
    } catch (err) {
      next(err);
    }
  };

  markSynced = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = this.getEmail(req);
      const id = req.params.id as string;
      const { syncedAt, finalScore } = req.body;

      if (!id) throw new AppError(400, 'MISSING_ID', 'Snapshot id is required.');

      await HistoryStore.updateSynced(
        email,
        id,
        syncedAt || new Date().toISOString(),
        finalScore,
      );
      res.json({ success: true, data: { message: 'Snapshot updated.' } });
    } catch (err) {
      next(err);
    }
  };
}
