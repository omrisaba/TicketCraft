import { Router } from 'express';
import { credentialExtractor } from '../middleware/credentialExtractor.js';
import { RepoController, upload } from '../controllers/repo.controller.js';

const router = Router();
const controller = new RepoController();

router.use(credentialExtractor);

router.post('/context', controller.fetchContext);
router.post('/fetch-urls', controller.fetchUrls);
router.post('/upload-files', upload.array('files', 10), controller.uploadFiles);

export { router as repoRouter };
