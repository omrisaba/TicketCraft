import type { Request, Response, NextFunction } from 'express';
import { MarkdownExporter } from '../services/export/MarkdownExporter.js';
import { AppError } from '../middleware/errorHandler.js';

export class ExportController {
  exportPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      throw new AppError(
        501,
        'PDF_NOT_IMPLEMENTED',
        'PDF export is not implemented yet. Use markdown export.',
      );
    } catch (err) {
      next(err);
    }
  };

  exportMarkdown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticket, improvements, score } = req.body;

      const exporter = new MarkdownExporter();
      const md = await exporter.exportAsMarkdown(ticket, improvements, score);

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${ticket.key}-improved.md"`);
      res.send(md);
    } catch (err) {
      next(err);
    }
  };
}
