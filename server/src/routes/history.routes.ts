import { Router } from 'express';
import { HistoryController } from '../controllers/history.controller.js';
import { credentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new HistoryController();

router.post('/', credentialExtractor, controller.save);
router.get('/', credentialExtractor, controller.list);
router.get('/:id', credentialExtractor, controller.load);
router.delete('/:id', credentialExtractor, controller.remove);
router.patch('/:id/synced', credentialExtractor, controller.markSynced);

export { router as historyRouter };
