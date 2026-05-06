import { Router } from 'express';
import { credentialExtractor } from '../middleware/credentialExtractor.js';
import { JiraController } from '../controllers/jira.controller.js';

const router = Router();
const controller = new JiraController();

router.use(credentialExtractor);

router.get('/ticket/:ticketKey', controller.getTicket);
router.get('/ticket/:ticketKey/linked', controller.getLinkedTickets);
router.put('/ticket/:ticketKey', controller.updateTicket);
router.post('/ticket', controller.createTicket);
router.post('/ticket/:ticketKey/attach', controller.uploadAttachment);

export { router as jiraRouter };
