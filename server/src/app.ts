import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sessionRouter } from './routes/session.routes.js';
import { jiraRouter } from './routes/jira.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { templateRouter } from './routes/template.routes.js';
import { repoRouter } from './routes/repo.routes.js';
import { draftRouter } from './routes/draft.routes.js';
import { automationRouter } from './routes/automation.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { historyRouter } from './routes/history.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(securityHeaders);
app.use(cors(config.cors));
app.use(rateLimiter);
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'healthy', timestamp: new Date().toISOString() } });
});

app.use('/api/session', sessionRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/templates', templateRouter);
app.use('/api/repo', repoRouter);
app.use('/api/drafts', draftRouter);
app.use('/api/automation', automationRouter);
app.use('/api/admin', adminRouter);
app.use('/api/history', historyRouter);

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
