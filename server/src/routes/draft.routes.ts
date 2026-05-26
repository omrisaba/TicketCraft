import { Router } from 'express';
import { DraftController } from '../controllers/draft.controller.js';
import { verifiedCredentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new DraftController();

router.get('/check', verifiedCredentialExtractor, controller.check);
router.get('/load', verifiedCredentialExtractor, controller.load);
router.post('/save', verifiedCredentialExtractor, controller.save);
router.delete('/', verifiedCredentialExtractor, controller.remove);

export { router as draftRouter };
