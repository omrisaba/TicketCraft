import { Router } from 'express';
import { SessionController } from '../controllers/session.controller.js';

const router = Router();
const controller = new SessionController();

router.get('/config', controller.getConfig);
router.post('/validate', controller.validate);

export { router as sessionRouter };
