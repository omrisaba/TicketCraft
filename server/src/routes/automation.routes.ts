import { Router } from 'express';
import { AutomationController } from '../controllers/automation.controller.js';
import { credentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new AutomationController();

router.get('/info', controller.info);
router.post('/search', credentialExtractor, controller.search);
router.post('/scan', credentialExtractor, controller.scan);
router.get('/pending', credentialExtractor, controller.pending);
router.get('/result/:ticketKey', credentialExtractor, controller.loadResult);
router.delete('/result/:ticketKey', credentialExtractor, controller.dismiss);
router.get('/profile', credentialExtractor, controller.loadRepoUrl);
router.post('/profile', credentialExtractor, controller.saveRepoUrl);

export { router as automationRouter };
