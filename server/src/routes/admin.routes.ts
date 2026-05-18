import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { verifiedCredentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new AdminController();

router.get('/settings', verifiedCredentialExtractor, controller.load);
router.put('/settings', verifiedCredentialExtractor, controller.save);
router.get('/cursor-models', verifiedCredentialExtractor, controller.cursorModels);
router.get('/logs', verifiedCredentialExtractor, controller.logs);
router.delete('/logs', verifiedCredentialExtractor, controller.clearLogs);
router.get('/usage', verifiedCredentialExtractor, controller.usage);

export { router as adminRouter };
