/**
 * Emit server/src/openapi/openapi.json for Swagger UI.
 * Run from repo root: node scripts/generate-openapi.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'server/src/openapi/openapi.json');

const CRED = [
  { $ref: '#/components/parameters/XJiraEmail' },
  { $ref: '#/components/parameters/XJiraToken' },
  { $ref: '#/components/parameters/XGeminiModel' },
  { $ref: '#/components/parameters/XGeminiTemperature' },
  { $ref: '#/components/parameters/XGithubToken' },
  { $ref: '#/components/parameters/XGitlabToken' },
];

/** @typedef {{ parameters?: unknown[] } & Record<string, unknown>} Op */
/** @param {Op} op @param {'none'|'email'|'credential'} mode */
function sec(op, mode = 'credential') {
  const base =
    mode === 'credential' ? CRED : mode === 'email' ? [{ $ref: '#/components/parameters/XJiraEmail' }] : [];
  return { ...op, parameters: [...base, ...(op.parameters || [])] };
}

/** @type {Record<string, unknown>} */
const components = {
  parameters: {
    XJiraEmail: {
      name: 'X-Jira-Email',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'Jira user email used for upstream Jira REST calls.',
    },
    XJiraToken: {
      name: 'X-Jira-Token',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'Jira REST API token (id.atlassian.com).',
    },
    XGeminiModel: {
      name: 'X-Gemini-Model',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description: 'Supported Gemini model id (see `/api/session/config`).',
    },
    XGeminiTemperature: {
      name: 'X-Gemini-Temperature',
      in: 'header',
      required: false,
      schema: { type: 'string', pattern: '^0(\\.\\d+)?|1(\\.0+)?$', example: '0.3' },
      description: 'Sampling temperature between 0 and 1.',
    },
    XGithubToken: {
      name: 'X-Github-Token',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description: 'Personal access token for private GitHub repo context / MCP.',
    },
    XGitlabToken: {
      name: 'X-Gitlab-Token',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description: 'Access token for private GitLab repos / MCP.',
    },
    TicketKeyPath: {
      name: 'ticketKey',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      example: 'PROJ-123',
    },
    SnapshotIdPath: {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Snapshot id returned when saving `/api/history`.',
    },
    TemplateTypePath: {
      name: 'type',
      in: 'path',
      required: true,
      schema: {
        type: 'string',
        enum: ['bug', 'feature', 'spike', 'tech-debt'],
      },
    },
  },
  schemas: {
    ApiSuccessGeneric: {
      type: 'object',
      description: 'Responses use `{ success, data?, error? }`; types vary per route.',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object', nullable: true, additionalProperties: true },
        error: {
          type: 'object',
          nullable: true,
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    HealthResponse: {
      type: 'object',
      properties: {
        success: { const: true },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    Ticket: {
      type: 'object',
      additionalProperties: true,
      description: 'Serialized Jira ticket. See ticketcraft-shared `Ticket` for full shapes.',
      properties: {
        key: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string', nullable: true },
        status: { type: 'string' },
      },
      required: ['key', 'summary', 'status'],
    },
    TicketChanges: {
      type: 'object',
      additionalProperties: true,
      description: 'Field updates (summary/description/labels/…) — ticketcraft-shared `TicketChanges`.',
    },
    DraftData: {
      type: 'object',
      additionalProperties: true,
      description: '`DraftData` from ticketcraft-shared (autosave envelope). Minimum: `ticketKey`.',
    },
    HistorySnapshot: {
      type: 'object',
      additionalProperties: true,
      description: '`HistorySnapshot` from ticketcraft-shared; must include `id` and `ticketKey` on save.',
    },
    RefineResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            updatedTicket: { $ref: '#/components/schemas/TicketChanges' },
            explanation: { type: 'string' },
          },
        },
      },
    },
    RepoUsageResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            connections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  repoEvidence: { type: 'string' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    GeneratedDocumentResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            format: { type: 'string', enum: ['markdown', 'mermaid'] },
          },
        },
      },
    },
  },
};

const jsonBody = (schema) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const ok = {
  description: 'Success envelope',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ApiSuccessGeneric' } },
  },
};

const ticketRef = { $ref: '#/components/schemas/Ticket' };
const changesRef = { $ref: '#/components/schemas/TicketChanges' };

/** @type {Record<string, Record<string, unknown>>} */
const paths = {
  '/api/health': {
    get: {
      tags: ['Health'],
      summary: 'Health check',
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
          },
        },
      },
    },
  },
  '/api/openapi.json': {
    get: {
      tags: ['Documentation'],
      summary: 'OpenAPI document (this file)',
      responses: {
        200: { description: 'OpenAPI 3 JSON' },
      },
    },
  },
  '/api/session/config': {
    get: {
      tags: ['Session'],
      summary: 'Public server config for the browser client',
      responses: { 200: ok },
    },
  },
  '/api/session/validate': {
    post: {
      tags: ['Session'],
      summary: 'Validate Jira credentials (JSON body; not header auth)',
      requestBody: jsonBody({
        type: 'object',
        required: ['jiraEmail', 'jiraApiToken'],
        properties: {
          jiraEmail: { type: 'string' },
          jiraApiToken: { type: 'string' },
          geminiModel: { type: 'string' },
        },
      }),
      responses: { 200: ok },
    },
  },
  '/api/jira/ticket/{ticketKey}/linked': {
    get: sec(
      {
        tags: ['Jira'],
        summary: 'Fetch linked tickets',
        parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
        responses: { 200: ok, 401: { description: 'Missing credentials' } },
      },
      'credential',
    ),
  },
  '/api/jira/ticket/{ticketKey}': {
    put: sec(
      {
        tags: ['Jira'],
        summary: 'Update ticket',
        parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
        requestBody: jsonBody(changesRef),
        responses: { 200: ok, 401: { description: 'Missing credentials' } },
      },
      'credential',
    ),
    get: sec(
      {
        tags: ['Jira'],
        summary: 'Fetch ticket by key',
        parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
        responses: { 200: ok, 401: { description: 'Missing credentials' } },
      },
      'credential',
    ),
  },
  '/api/jira/ticket/{ticketKey}/attach': {
    post: sec(
      {
        tags: ['Jira'],
        summary: 'Upload attachment (base64-encoded body)',
        parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
        requestBody: jsonBody({
          type: 'object',
          required: ['filename', 'content'],
          properties: {
            filename: { type: 'string' },
            content: { type: 'string', description: 'base64-encoded file bytes' },
            mimeType: { type: 'string' },
          },
        }),
        responses: { 200: ok, 401: { description: 'Missing credentials' } },
      },
      'credential',
    ),
  },
  '/api/jira/ticket': {
    post: sec(
      {
        tags: ['Jira'],
        summary: 'Create ticket',
        requestBody: jsonBody({
          type: 'object',
          required: ['projectKey', 'changes'],
          properties: {
            projectKey: { type: 'string', example: 'PROJ' },
            issueType: { type: 'string', example: 'Task' },
            changes: changesRef,
            parentKey: { type: 'string' },
            linkToOriginal: { type: 'boolean' },
            originalKey: { type: 'string' },
          },
        }),
        responses: { 200: ok, 401: { description: 'Missing credentials' } },
      },
      'credential',
    ),
  },
  '/api/ai/score': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Score ticket quality',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket'],
          properties: {
            ticket: ticketRef,
            linkedTickets: { type: 'array', items: ticketRef },
            repoContextPrompt: { type: 'string' },
            referenceContent: { type: 'string' },
            repoUrl: { type: 'string' },
          },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/ai/improve': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Generate improved ticket (Gemini / optional Cursor + MCP enrichment)',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket'],
          properties: {
            ticket: ticketRef,
            templateType: { type: 'string', enum: ['bug', 'feature', 'spike', 'tech-debt'] },
            userAnswers: { type: 'object', additionalProperties: { type: 'string' } },
            linkedTickets: { type: 'array', items: ticketRef },
            skillsMarkdown: { type: 'string', description: 'Optional session Markdown rules' },
            repoContextPrompt: { type: 'string' },
            referenceContent: { type: 'string' },
            repoUrl: { type: 'string' },
            useCursor: { type: 'boolean' },
          },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/ai/questions': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Guide questions for weak score dimensions',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket', 'weakDimensions'],
          properties: {
            ticket: ticketRef,
            weakDimensions: { type: 'array', items: { type: 'string' } },
            repoContextPrompt: { type: 'string' },
            referenceContent: { type: 'string' },
            repoUrl: { type: 'string' },
          },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/ai/enrich': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Improve with MCP/repo enrichment (skillsMarkdown supported)',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket'],
          properties: {
            ticket: ticketRef,
            userAnswers: { type: 'object', additionalProperties: { type: 'string' } },
            templateType: { type: 'string' },
            linkedTickets: { type: 'array', items: ticketRef },
            skillsMarkdown: { type: 'string' },
            repoContextPrompt: { type: 'string' },
            referenceContent: { type: 'string' },
            repoUrl: { type: 'string' },
          },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/ai/annotate': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Explain why fields changed',
        requestBody: jsonBody({
          type: 'object',
          required: ['original', 'improved'],
          properties: { original: ticketRef, improved: changesRef },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/ai/refine': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Iterative refinement chat (skillsMarkdown + MCP supported)',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket', 'currentImprovements', 'instruction', 'conversationHistory'],
          properties: {
            ticket: ticketRef,
            currentImprovements: changesRef,
            instruction: { type: 'string' },
            conversationHistory: { type: 'array', items: { type: 'object', additionalProperties: true } },
            repoContextPrompt: { type: 'string' },
            referenceContent: { type: 'string' },
            skillsMarkdown: { type: 'string', description: 'Optional session Markdown rules' },
            repoUrl: { type: 'string', description: 'Repo URL for MCP enrichment' },
          },
        }),
        responses: {
          200: {
            description: 'Refined ticket with explanation',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RefineResponse' } },
            },
          },
        },
      },
      'credential',
    ),
  },
  '/api/ai/repo-usage': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Summarize repo alignment for an improved ticket',
        requestBody: jsonBody({
          type: 'object',
          required: ['improvedTicket', 'repoContextPrompt'],
          properties: {
            improvedTicket: changesRef,
            repoContextPrompt: { type: 'string' },
          },
        }),
        responses: {
          200: {
            description: 'Repo usage summary with field-level connections',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RepoUsageResponse' } },
            },
          },
        },
      },
      'credential',
    ),
  },
  '/api/ai/document': {
    post: sec(
      {
        tags: ['AI'],
        summary: 'Generate supporting document (TRD, runbook, etc.)',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket', 'docType'],
          properties: { ticket: ticketRef, docType: { type: 'string' } },
        }),
        responses: {
          200: {
            description: 'Generated document',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GeneratedDocumentResponse' } },
            },
          },
        },
      },
      'credential',
    ),
  },
  '/api/export/markdown': {
    post: sec(
      {
        tags: ['Export'],
        summary: 'Download improved ticket as Markdown',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket', 'format'],
          properties: {
            ticket: ticketRef,
            improvements: changesRef,
            score: { type: 'object', additionalProperties: true },
            format: { type: 'string', enum: ['markdown', 'pdf'] },
          },
        }),
        responses: {
          200: {
            description: 'Markdown bytes',
            content: { 'text/markdown': { schema: { type: 'string' } } },
          },
        },
      },
      'credential',
    ),
  },
  '/api/export/pdf': {
    post: sec(
      {
        tags: ['Export'],
        summary: 'Legacy route name (returns Markdown like `/api/export/markdown`)',
        requestBody: jsonBody({
          type: 'object',
          required: ['ticket', 'format'],
          properties: {
            ticket: ticketRef,
            improvements: changesRef,
            score: { type: 'object', additionalProperties: true },
            format: { type: 'string', enum: ['markdown', 'pdf'] },
          },
        }),
        responses: {
          200: {
            description: 'Markdown bytes',
            content: { 'text/markdown': { schema: { type: 'string' } } },
          },
        },
      },
      'credential',
    ),
  },
  '/api/templates': {
    get: {
      tags: ['Templates'],
      summary: 'List template metadata',
      responses: { 200: ok },
    },
  },
  '/api/templates/{type}': {
    get: {
      tags: ['Templates'],
      summary: 'Fetch template content',
      parameters: [{ $ref: '#/components/parameters/TemplateTypePath' }],
      responses: { 200: ok },
    },
  },
  '/api/repo/context': {
    post: sec(
      {
        tags: ['Repository'],
        summary: 'Fetch lightweight repo metadata for prompts',
        requestBody: jsonBody({
          type: 'object',
          required: ['repoUrl'],
          properties: { repoUrl: { type: 'string', format: 'uri' } },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/repo/fetch-urls': {
    post: sec(
      {
        tags: ['Repository'],
        summary: 'Fetch reference URLs (markdown/html text)',
        requestBody: jsonBody({
          type: 'object',
          required: ['urls'],
          properties: { urls: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 10 } },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/repo/upload-files': {
    post: sec(
      {
        tags: ['Repository'],
        summary: 'Upload text files (multipart form field `files`, up to 10)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        },
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/drafts/check': {
    get: sec(
      {
        tags: ['Drafts'],
        summary: 'Check for saved draft metadata',
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/drafts/load': {
    get: sec(
      {
        tags: ['Drafts'],
        summary: 'Load latest draft for this X-Jira-Email',
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/drafts/save': {
    post: sec(
      {
        tags: ['Drafts'],
        summary: 'Persist draft payload',
        requestBody: jsonBody({ $ref: '#/components/schemas/DraftData' }),
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/drafts': {
    delete: sec(
      {
        tags: ['Drafts'],
        summary: 'Delete saved draft',
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/automation/info': {
    get: {
      tags: ['Automation'],
      summary: 'Automation labels + base JQL fragments',
      responses: { 200: ok },
    },
  },
  '/api/automation/scan': {
    post: sec(
      {
        tags: ['Automation'],
        summary: 'Scan Jira + process eligible tickets (server-side job)',
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/automation/pending': {
    get: sec(
      {
        tags: ['Automation'],
        summary: 'List pending automation results for user',
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/automation/profile': {
    get: sec(
      {
        tags: ['Automation'],
        summary: 'Load automation profile (repo URL)',
        responses: { 200: ok },
      },
      'credential',
    ),
    post: sec(
      {
        tags: ['Automation'],
        summary: 'Save automation profile',
        requestBody: jsonBody({
          type: 'object',
          properties: { repoUrl: { type: 'string', nullable: true } },
        }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/admin/settings': {
    get: sec(
      {
        tags: ['Admin'],
        summary: 'Load admin settings JSON (admin UI)',
        responses: { 200: ok },
      },
      'credential',
    ),
    put: sec(
      {
        tags: ['Admin'],
        summary: 'Save admin settings JSON',
        requestBody: jsonBody({ type: 'object', additionalProperties: true }),
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/admin/cursor-models': {
    get: sec(
      {
        tags: ['Admin'],
        summary: 'List Cursor models for admin dropdown',
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/admin/logs': {
    get: sec(
      {
        tags: ['Admin'],
        summary: 'Read rotating LLM/MCP logs',
        responses: { 200: ok },
      },
      'credential',
    ),
    delete: sec(
      {
        tags: ['Admin'],
        summary: 'Clear log buffer',
        responses: { 200: ok },
      },
      'credential',
    ),
  },
  '/api/history': {
    post: sec(
      {
        tags: ['History'],
        summary: 'Save history snapshot',
        requestBody: jsonBody({ $ref: '#/components/schemas/HistorySnapshot' }),
        responses: { 200: ok },
      },
      'email',
    ),
    get: sec(
      {
        tags: ['History'],
        summary: 'List snapshots',
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/history/{id}': {
    get: sec(
      {
        tags: ['History'],
        summary: 'Load snapshot',
        parameters: [{ $ref: '#/components/parameters/SnapshotIdPath' }],
        responses: { 200: ok, 404: { description: 'Not found' } },
      },
      'email',
    ),
    delete: sec(
      {
        tags: ['History'],
        summary: 'Delete snapshot',
        parameters: [{ $ref: '#/components/parameters/SnapshotIdPath' }],
        responses: { 200: ok },
      },
      'email',
    ),
  },
  '/api/history/{id}/synced': {
    patch: sec(
      {
        tags: ['History'],
        summary: 'Mark snapshot synced to Jira',
        parameters: [{ $ref: '#/components/parameters/SnapshotIdPath' }],
        requestBody: jsonBody({
          type: 'object',
          properties: { syncedAt: { type: 'string', format: 'date-time' } },
        }),
        responses: { 200: ok },
      },
      'email',
    ),
  },
};

paths['/api/automation/result/{ticketKey}'] = {
  get: sec(
    {
      tags: ['Automation'],
      summary: 'Load automation result',
      parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
      responses: { 200: ok, 404: { description: 'Not found' } },
    },
    'credential',
  ),
  delete: sec(
    {
      tags: ['Automation'],
      summary: 'Dismiss automation result',
      parameters: [{ $ref: '#/components/parameters/TicketKeyPath' }],
      responses: { 200: ok },
    },
    'credential',
  ),
};

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'TicketCraft API',
    version: '1.0.0',
    description:
      'HTTP JSON API used by the TicketCraft UI and integrators. Most write routes require `X-Jira-Email` and `X-Jira-Token`. Optional `X-Gemini-Model`, `X-Gemini-Temperature`, `X-Github-Token`, `X-Gitlab-Token` mirror the SPA. Admin routes still require the same headers (no separate admin token). Draft/history routes only require `X-Jira-Email`.',
  },
  servers: [{ url: '/', description: 'TicketCraft server (same origin as deployment)' }],
  tags: [
    { name: 'Health', description: 'Liveness' },
    { name: 'Session', description: 'Config + credential validation' },
    { name: 'Jira', description: 'Issue tracker proxy' },
    { name: 'AI', description: 'Gemini / Cursor flows' },
    { name: 'Export', description: 'Markdown exports' },
    { name: 'Templates', description: 'Ticket templates' },
    { name: 'Repository', description: 'Repo + reference helpers' },
    { name: 'Drafts', description: 'Per-email autosave' },
    { name: 'Automation', description: 'Jira automation hooks' },
    { name: 'Admin', description: 'Admin JSON + logs' },
    { name: 'History', description: 'Saved improvement snapshots' },
    { name: 'Documentation', description: 'OpenAPI delivery' },
  ],
  components,
  paths,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
console.log('Wrote', out);
