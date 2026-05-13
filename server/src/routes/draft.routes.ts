import { Router } from 'express';
import { DraftController } from '../controllers/draft.controller.js';
import { credentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new DraftController();

router.get('/check', credentialExtractor, controller.check);
router.get('/load', credentialExtractor, controller.load);
router.post('/save', credentialExtractor, controller.save);
router.delete('/', credentialExtractor, controller.remove);

export { router as draftRouter };
