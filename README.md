# TicketCraft

AI-powered Jira ticket quality improvement tool. Score, improve, compose, and sync tickets back to Jira with the power of Google Gemini — optionally enhanced with Cursor agents and MCP-based repository context.

## Features

- **Ticket Scoring** — Score tickets across 6 dimensions (clarity, completeness, actionability, testability, formatting, context) with an overall 0-100 score
- **Guiding Questions** — AI generates targeted questions for weak areas to help fill in missing information
- **AI Improvement** — Rewrite descriptions, generate acceptance criteria, suggest story points, create supporting documents and diagrams
- **Compose from Scratch** — Create brand new Jira tickets from a rough description, with optional breakdown into subtasks and batch creation
- **Task Breakdown** — Decompose tickets into implementable subtasks with individual descriptions, acceptance criteria, and story point estimates
- **Ticket Templates** — Bug, Feature, Spike, and Tech Debt templates guide the AI's output structure
- **Linked Ticket Context** — Optionally fetches related tickets for context-aware improvements
- **Repository Context** — Connect a GitHub or GitLab repository for code-aware scoring and improvements
- **MCP Integration** — Agentic loop using Model Context Protocol servers to gather deeper repository context via GitHub/GitLab tool calls
- **Cursor Integration** — Use Cursor agents to explore a cloned repo and produce code-informed improvements, compositions, and breakdowns
- **User Skills** — Provide session-only Markdown rules (coding standards, team conventions) that are inlined into AI prompts
- **Reference Links & File Uploads** — Add external URLs or upload local files as additional context for the AI
- **Refinement Chat** — Iteratively refine improvements through natural-language conversation
- **Annotated Diff View** — Side-by-side comparison with AI explanations for each change
- **Export** — Download improved tickets as Markdown
- **Sync to Jira** — Push approved changes and attachments back to Jira, or create new tickets
- **Ticket Scanner** — Batch-process multiple tickets via JQL query with label-driven automation
- **Drafts** — Auto-save work in progress; resume from a draft after navigating away or session timeout
- **Session History** — Track all tickets improved in the current session, with server-side persistence
- **Ticket Graph** — Interactive node diagram visualizing ticket relationships (parent, subtasks, linked issues)
- **Admin Panel** — Settings management, server logs, and usage dashboard for admin users
- **Swagger / OpenAPI** — Built-in interactive API documentation at `/api/docs`

## Security & Privacy

- **Zero credential storage** — All API keys and tokens exist only in browser memory during the active session
- **No localStorage, no cookies, no database** — Credentials are never persisted
- **HTTPS by default** — Both server and client run over TLS
- **Inactivity timeout** — Session auto-wipes after 30 minutes of inactivity (configurable)
- **Credential headers** — API keys travel via request headers over HTTPS, never in URLs or logs
- **Helmet.js** — Full security header suite (CSP, HSTS, X-Frame-Options, etc.)
- **Rate limiting** — Per-IP rate limiting on all endpoints

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install dependencies
npm install

# Generate HTTPS certificates for local development
npm run generate-certs

# Copy .env.example and set admin configuration
cp .env.example .env
# Edit .env — set GEMINI_API_KEY and JIRA_BASE_URL (required)

# Start both server and client
npm run dev
```

The app will be available at `https://localhost:5173` with the API server at `https://localhost:3001`.

API documentation (Swagger UI) is available at `https://localhost:3001/api/docs`.

### Admin Configuration (.env)

These are set once by the admin and apply to all users:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for all AI operations |
| `JIRA_BASE_URL` | Yes | Jira instance URL (e.g., `https://yourcompany.atlassian.net`) |
| `GEMINI_DEFAULT_MODEL` | No | Default model, users can override (default: `gemini-3.1-pro-preview`) |
| `ADMIN_EMAILS` | No | Comma-separated emails allowed to access admin panel |
| `SESSION_TIMEOUT_MS` | No | Inactivity timeout in ms (default: `1800000` / 30 min) |
| `PORT` | No | HTTPS listen port (default: `3001`) |
| `HTTP_PORT` | No | HTTP redirect port (default: `3000`) |
| `HOST` | No | Network interface to bind (default: `0.0.0.0`) |
| `RATE_LIMIT_MAX` | No | Max requests per IP per 15-min window (default: `100`) |
| `TRUST_PROXY` | No | Set `true` when behind a reverse proxy |
| `CORS_ORIGIN` | No | Comma-separated allowed origins (empty = same-origin) |
| `TLS_CERT_PATH` | No | Path to TLS certificate file |
| `TLS_KEY_PATH` | No | Path to TLS private key file |
| `AUTOMATION_TRIGGER_LABEL` | No | Jira label that triggers scanning (default: `readyForTicketCraftRefinement`) |
| `AUTOMATION_DONE_LABEL` | No | Jira label applied after processing (default: `processedByTicketCraft`) |

### Per-User Session

Each user provides their personal credentials when starting a session:

- **Jira Email** — Their Jira account email
- **Jira API Token** — Generate at https://id.atlassian.com/manage-profile/security/api-tokens
- **Gemini Model** (optional) — Override the default model from the dropdown
- **GitHub Token** (optional) — For private GitHub repository context
- **GitLab Token** (optional) — For private GitLab repository context
- **Cursor API Key** (optional) — Enable Cursor agent integration for code-aware improvements

Credentials can also be loaded from a local JSON file (read entirely in the browser, never uploaded).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS 4 + Lucide Icons |
| Backend | Node.js + Express 5 |
| AI | Google Gemini API (3.0/3.1 models) |
| AI (optional) | Cursor SDK for repo-aware agent analysis |
| Repo Context | MCP (Model Context Protocol) for GitHub/GitLab |
| Jira | Jira REST API v3 |
| Security | Helmet.js, CORS, rate-limiting, HTTPS |
| API Docs | Swagger UI / OpenAPI 3.0 |

## Project Structure

```
TicketCraft/
├── client/                  # React frontend
│   └── src/
│       ├── components/      # UI components
│       │   ├── SessionStart/        # Login & credential loading
│       │   ├── TicketWorkspace/     # Main improve flow + UserSkillsPanel
│       │   ├── ComposeWorkspace/    # Create-from-scratch flow
│       │   ├── BreakdownPanel/      # Subtask decomposition
│       │   ├── ScoreCard/           # Ticket quality scores
│       │   ├── DiffView/            # Side-by-side change comparison
│       │   ├── GuidingQuestions/    # AI-generated questions
│       │   ├── RefinementChat/      # Iterative improvement chat
│       │   ├── TemplateSelector/    # Template picker
│       │   ├── RepoConnector/       # Repository connection
│       │   ├── ReferenceLinks/      # URL & file reference panel
│       │   ├── TicketGraph/         # Interactive relationship diagram
│       │   ├── PendingReviews/      # Ticket scanner / automation
│       │   ├── SessionHistory/      # Session history list
│       │   ├── CreateTicketModal/   # Create new Jira ticket modal
│       │   ├── ExportPanel/         # Markdown export
│       │   ├── RepoUsageCard/       # Repo context usage display
│       │   ├── McpUsageCard/        # MCP tool call stats
│       │   ├── AdminSettings/       # Admin configuration panel
│       │   ├── UsageDashboard/      # Per-user usage analytics
│       │   ├── LogsPanel/           # Server log viewer
│       │   └── ui/                  # Shared UI primitives
│       ├── context/         # Session context (in-memory credential store)
│       └── services/        # API client
├── server/                  # Express backend
│   └── src/
│       ├── routes/          # API route definitions
│       ├── controllers/     # Request handlers
│       ├── services/        # Business logic
│       │   ├── ai/              # GeminiAdapter, CursorAdapter
│       │   ├── jira/            # JiraClient
│       │   ├── mcp/             # McpAgent, McpClient
│       │   ├── repo/            # RepoService, RepoCloneStore
│       │   ├── admin/           # AdminStore
│       │   ├── automation/      # AutomationStore
│       │   ├── draft/           # DraftStore
│       │   ├── history/         # HistoryStore
│       │   ├── usage/           # UsageTracker
│       │   ├── logging/         # LogBuffer
│       │   ├── export/          # MarkdownExporter
│       │   ├── templates/       # TemplateRepository
│       │   └── interfaces/      # TypeScript interfaces
│       ├── middleware/      # Security, auth, validation, error handling
│       ├── openapi/         # Swagger/OpenAPI spec & UI
│       └── config/          # Environment configuration
├── shared/                  # Shared TypeScript types
│   └── types/               # Ticket, Score, Session, Admin, Automation,
│                            # Draft, History, MCP, Repo, Usage, Limits, etc.
├── helm/                    # Kubernetes / OpenShift Helm chart
├── scripts/                 # Dev utilities (cert generation, OpenAPI, user guide)
└── Dockerfile               # Container build
```

## API Endpoints

### Session

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/session/config` | Get server configuration (Jira host, models, admin settings) |
| POST | `/api/session/validate` | Validate Jira credentials and start a session |

### Jira

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jira/ticket/:key` | Fetch a Jira ticket |
| GET | `/api/jira/ticket/:key/linked` | Fetch linked tickets |
| PUT | `/api/jira/ticket/:key` | Update a ticket in Jira |
| POST | `/api/jira/ticket` | Create a new ticket |
| POST | `/api/jira/ticket/batch` | Batch-create parent + subtasks |
| POST | `/api/jira/ticket/:key/attach` | Upload attachment |
| GET | `/api/jira/projects` | Search Jira projects |
| GET | `/api/jira/projects/:projectKey/issuetypes` | Get issue types for a project |
| GET | `/api/jira/projects/:projectKey/assignable-users` | Search assignable users |

### AI

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/score` | Score a ticket |
| POST | `/api/ai/improve` | Generate improvements |
| POST | `/api/ai/compose` | Compose a new ticket from free text |
| POST | `/api/ai/breakdown` | Break a ticket into subtasks |
| POST | `/api/ai/questions` | Generate guiding questions |
| POST | `/api/ai/enrich` | Re-generate with user answers |
| POST | `/api/ai/annotate` | Annotate changes |
| POST | `/api/ai/refine` | Refinement chat (iterative edits) |
| POST | `/api/ai/repo-usage` | Explain how repo context was used |
| POST | `/api/ai/document` | Generate a supporting document |

### Repository & References

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/repo/context` | Fetch repository context (clone + summarize) |
| POST | `/api/repo/fetch-urls` | Fetch content from reference URLs |
| POST | `/api/repo/upload-files` | Upload local files as reference context |

### Templates & Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List available templates |
| GET | `/api/templates/:type` | Get a specific template |
| POST | `/api/export/markdown` | Export as Markdown |

### Drafts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/drafts/check` | Check if a draft exists |
| GET | `/api/drafts/load` | Load a saved draft |
| POST | `/api/drafts/save` | Save a draft |
| DELETE | `/api/drafts` | Delete a draft |

### History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/history` | List session history entries |
| GET | `/api/history/:id` | Load a history entry |
| POST | `/api/history` | Save a history entry |
| DELETE | `/api/history/:id` | Delete a history entry |
| PATCH | `/api/history/:id/synced` | Mark a history entry as synced |

### Automation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/automation/info` | Get automation label configuration |
| POST | `/api/automation/search` | Search tickets by JQL |
| POST | `/api/automation/scan` | Scan and score multiple tickets |
| GET | `/api/automation/pending` | Get pending review results |
| GET | `/api/automation/result/:key` | Load a scan result |
| DELETE | `/api/automation/result/:key` | Dismiss a scan result |
| GET | `/api/automation/profile` | Load saved repo URL profile |
| POST | `/api/automation/profile` | Save repo URL profile |

### Admin (requires `ADMIN_EMAILS`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/settings` | Load admin settings |
| PUT | `/api/admin/settings` | Save admin settings |
| GET | `/api/admin/cursor-models` | List available Cursor models |
| GET | `/api/admin/logs` | View server logs |
| DELETE | `/api/admin/logs` | Clear server logs |
| GET | `/api/admin/usage` | View usage statistics |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/docs` | Swagger UI (interactive API documentation) |

## Available Gemini Models

- **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`) — highest quality, default
- **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite-preview`) — faster, lower cost
- **Gemini 3.0 Flash** (`gemini-3-flash-preview`) — previous generation flash model

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
