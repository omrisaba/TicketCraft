import { Router } from 'express';
import { HistoryController } from '../controllers/history.controller.js';

const router = Router();
const controller = new HistoryController();

router.post('/', controller.save);
router.get('/', controller.list);
router.get('/:id', controller.load);
router.delete('/:id', controller.remove);
router.patch('/:id/synced', controller.markSynced);

export { router as historyRouter };
