import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { credentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new AdminController();

router.get('/settings', credentialExtractor, controller.load);
router.put('/settings', credentialExtractor, controller.save);
router.get('/cursor-models', credentialExtractor, controller.cursorModels);
router.get('/logs', credentialExtractor, controller.logs);
router.delete('/logs', credentialExtractor, controller.clearLogs);

export { router as adminRouter };
