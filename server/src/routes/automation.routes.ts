import { Router } from 'express';
import { AutomationController } from '../controllers/automation.controller.js';
import { verifiedCredentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new AutomationController();

router.get('/info', controller.info);
router.post('/search', verifiedCredentialExtractor, controller.search);
router.post('/scan', verifiedCredentialExtractor, controller.scan);
router.get('/pending', verifiedCredentialExtractor, controller.pending);
router.get('/result/:ticketKey', verifiedCredentialExtractor, controller.loadResult);
router.delete('/result/:ticketKey', verifiedCredentialExtractor, controller.dismiss);
router.get('/profile', verifiedCredentialExtractor, controller.loadRepoUrl);
router.post('/profile', verifiedCredentialExtractor, controller.saveRepoUrl);

export { router as automationRouter };
