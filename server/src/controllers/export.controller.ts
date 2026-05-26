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

      if (!ticket?.key || !/^[A-Z][A-Z0-9]+-\d+$/i.test(ticket.key)) {
        throw new AppError(400, 'INVALID_TICKET_KEY', 'Valid ticket key is required for export.');
      }

      const exporter = new MarkdownExporter();
      const md = await exporter.exportAsMarkdown(ticket, improvements, score);

      const safeKey = ticket.key.replace(/[^A-Za-z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeKey}-improved.md"`);
      res.send(md);
    } catch (err) {
      next(err);
    }
  };
}
