import { Router } from 'express';
import { TemplateController } from '../controllers/template.controller.js';

const router = Router();
const controller = new TemplateController();

router.get('/', controller.listTemplates);
router.get('/:type', controller.getTemplate);

export { router as templateRouter };
