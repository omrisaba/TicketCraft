import { Router } from 'express';
import { credentialExtractor } from '../middleware/credentialExtractor.js';
import { aiRateLimiter } from '../middleware/rateLimiter.js';
import { AIController } from '../controllers/ai.controller.js';

const router = Router();
const controller = new AIController();

router.use(credentialExtractor);
router.use(aiRateLimiter);

router.post('/score', controller.score);
router.post('/improve', controller.improve);
router.post('/compose', controller.compose);
router.post('/breakdown', controller.breakdown);
router.post('/questions', controller.generateQuestions);
router.post('/enrich', controller.enrich);
router.post('/annotate', controller.annotate);
router.post('/refine', controller.refine);
router.post('/repo-usage', controller.repoUsage);
router.post('/document', controller.generateDocument);

export { router as aiRouter };
