import { Router } from 'express';
import { credentialExtractor } from '../middleware/credentialExtractor.js';
import { ExportController } from '../controllers/export.controller.js';

const router = Router();
const controller = new ExportController();

router.use(credentialExtractor);

router.post('/pdf', controller.exportPdf);
router.post('/markdown', controller.exportMarkdown);

export { router as exportRouter };
