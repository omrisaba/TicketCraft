# TicketCraft

AI-powered Jira ticket quality improvement tool. Score, improve, and sync tickets back to Jira with the power of Google Gemini.

## Features

- **Ticket Scoring** — Score tickets across 6 dimensions (clarity, completeness, actionability, testability, formatting, context) with an overall 0-100 score
- **Guiding Questions** — AI generates targeted questions for weak areas to help fill in missing information
- **AI Improvement** — Rewrite descriptions, generate acceptance criteria, suggest story points, create supporting documents and diagrams
- **Ticket Templates** — Bug, Feature, Spike, and Tech Debt templates guide the AI's output structure
- **Linked Ticket Context** — Optionally fetches related tickets for context-aware improvements
- **Annotated Diff View** — Side-by-side comparison with AI explanations for each change
- **Export** — Download improved tickets as Markdown before syncing
- **Sync to Jira** — Push approved changes and attachments back to Jira
- **Session History** — Track all tickets improved in the current session

## Security & Privacy

- **Zero credential storage** — All API keys and tokens exist only in browser memory during the active session
- **No localStorage, no cookies, no database** — Credentials are never persisted
- **HTTPS by default** — Both server and client run over TLS
- **Inactivity timeout** — Session auto-wipes after 30 minutes of inactivity
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

### Admin Configuration (.env)

These are set once by the admin and apply to all users:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for all AI operations |
| `JIRA_BASE_URL` | Yes | Jira instance URL (e.g., `https://yourcompany.atlassian.net`) |
| `GEMINI_DEFAULT_MODEL` | No | Default model, users can override (default: `gemini-3.1-pro-preview`) |

### Per-User Session

Each user provides only their personal Jira credentials when starting a session:
- **Jira Email** — Their Jira account email
- **Jira API Token** — Generate at https://id.atlassian.com/manage-profile/security/api-tokens
- **Gemini Model** (optional) — Override the default model from the dropdown

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind CSS 4 + Lucide Icons |
| Backend | Node.js + Express 5 |
| AI | Google Gemini API (3.0/3.1 models) |
| Jira | Jira REST API v3 |
| Security | Helmet.js, CORS, rate-limiting, HTTPS |

## Project Structure

```
TicketCraft/
├── client/              # React frontend
│   └── src/
│       ├── components/  # UI components (SessionStart, ScoreCard, DiffView, etc.)
│       ├── context/     # Session context (in-memory credential store)
│       ├── services/    # API client
│       └── utils/       # Helpers
├── server/              # Express backend
│   └── src/
│       ├── routes/      # API routes
│       ├── controllers/ # Request handlers
│       ├── services/    # Business logic (Gemini, Jira, Export, Templates)
│       │   └── interfaces/ # TypeScript interfaces for all services
│       ├── middleware/  # Security, auth, validation, error handling
│       └── config/      # Environment configuration
├── shared/              # Shared TypeScript types
│   └── types/           # Ticket, Score, Session, Template, API types
└── scripts/             # Dev utilities (cert generation)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/session/validate` | Validate Jira + Gemini credentials |
| GET | `/api/jira/ticket/:key` | Fetch a Jira ticket |
| GET | `/api/jira/ticket/:key/linked` | Fetch linked tickets |
| PUT | `/api/jira/ticket/:key` | Update a ticket |
| POST | `/api/jira/ticket/:key/attach` | Upload attachment |
| POST | `/api/ai/score` | Score a ticket |
| POST | `/api/ai/improve` | Generate improvements |
| POST | `/api/ai/questions` | Generate guiding questions |
| POST | `/api/ai/enrich` | Re-generate with user answers |
| POST | `/api/ai/annotate` | Annotate changes |
| POST | `/api/ai/document` | Generate a document |
| GET | `/api/templates` | List templates |
| GET | `/api/templates/:type` | Get a specific template |
| POST | `/api/export/markdown` | Export as Markdown |

## Available Gemini Models

- Gemini 3.1 Pro (default)
- Gemini 3.1 Flash
- Gemini 3.0 Pro
- Gemini 3.0 Flash

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
