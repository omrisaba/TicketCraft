import { Router } from 'express';
import { HistoryController } from '../controllers/history.controller.js';
import { verifiedCredentialExtractor } from '../middleware/credentialExtractor.js';

const router = Router();
const controller = new HistoryController();

router.post('/', verifiedCredentialExtractor, controller.save);
router.get('/', verifiedCredentialExtractor, controller.list);
router.get('/:id', verifiedCredentialExtractor, controller.load);
router.delete('/:id', verifiedCredentialExtractor, controller.remove);
router.patch('/:id/synced', verifiedCredentialExtractor, controller.markSynced);

export { router as historyRouter };
