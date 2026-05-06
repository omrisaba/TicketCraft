import { Router } from 'express';
import { DraftController } from '../controllers/draft.controller.js';

const router = Router();
const controller = new DraftController();

router.get('/check', controller.check);
router.get('/load', controller.load);
router.post('/save', controller.save);
router.delete('/', controller.remove);

export { router as draftRouter };
