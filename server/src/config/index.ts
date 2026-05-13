import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  httpPort: parseInt(process.env.HTTP_PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : false,
    credentials: true,
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  tls: {
    certPath: process.env.TLS_CERT_PATH || path.resolve(__dirname, '../../certs/localhost.crt'),
    keyPath: process.env.TLS_KEY_PATH || path.resolve(__dirname, '../../certs/localhost.key'),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.1-pro-preview',
  },

  jira: {
    baseUrl: process.env.JIRA_BASE_URL || '',
  },

  automation: {
    triggerLabel: process.env.AUTOMATION_TRIGGER_LABEL || 'readyForTicketCraftRefinement',
    doneLabel: process.env.AUTOMATION_DONE_LABEL || 'processedByTicketCraft',
  },

  session: {
    inactivityTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || String(30 * 60 * 1000), 10),
  },
} as const;

export function validateConfig() {
  const errors: string[] = [];
  if (!config.gemini.apiKey) errors.push('GEMINI_API_KEY is required');
  if (!config.jira.baseUrl) errors.push('JIRA_BASE_URL is required');
  if (errors.length > 0) {
    console.error('[CONFIG ERROR] Missing required environment variables:');
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error('Create a .env file based on .env.example and restart.');
    process.exit(1);
  }
}
