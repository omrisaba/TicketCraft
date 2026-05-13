import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.join(__dirname, 'openapi.json');

/** OpenAPI JSON served at `/api/openapi.json` and Swagger UI at `/api/docs`. */
export function setupSwagger(app: Express): void {
  let openapiDocument: object;
  try {
    openapiDocument = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')) as object;
  } catch (e) {
    console.error('[OpenAPI] Failed to load openapi.json:', (e as Error).message);
    return;
  }

  const options: swaggerUi.SwaggerUiOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TicketCraft API',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    },
  };

  app.get('/api/openapi.json', (_req, res) => {
    res.json(openapiDocument);
  });

  app.use('/api/docs', ...swaggerUi.serve, swaggerUi.setup(openapiDocument, options));
}
