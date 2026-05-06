import type { Request, Response, NextFunction } from 'express';
import { getParam } from '../types/index.js';
import { TemplateRepository } from '../services/templates/TemplateRepository.js';

export class TemplateController {
  private repo = new TemplateRepository();

  listTemplates = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templates = this.repo.listTemplates();
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  };

  getTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = getParam(req, 'type');
      const template = this.repo.getTemplate(type);
      if (!template) {
        res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: `Template type "${type}" not found.` },
        });
        return;
      }
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  };
}
