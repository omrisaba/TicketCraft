# TicketCraft Admin & Developer Guide

This guide covers deployment, configuration, security architecture, and API reference for operators and developers managing a TicketCraft instance. For end-user documentation, see [USER_GUIDE.md](USER_GUIDE.md).

---

## 1. Prerequisites

- **Google Gemini API key** — get one at https://aistudio.google.com/apikey
- **Jira Cloud instance URL** (e.g., `https://yourcompany.atlassian.net`)
- One of the following, depending on deployment method:
  - **Local development:** Node.js 18+ and npm 9+
  - **Docker:** Docker Engine 20+
  - **Kubernetes / OpenShift:** Helm 3, access to a cluster, and a container registry

---

## 2. Deployment

### Option A: Local Development

**Step 1.** Clone the repository and install dependencies:

```
npm install
```

**Step 2.** Generate HTTPS certificates for local development:

```
npm run generate-certs
```

This creates self-signed certificates under `server/certs/`. If you have `mkcert` installed, it will use that for trusted local certs; otherwise it falls back to OpenSSL.

**Step 3.** Create your environment file:

```
cp .env.example .env
```

**Step 4.** Edit `.env` and set the two required variables:

- **GEMINI_API_KEY** — your Google Gemini API key
- **JIRA_BASE_URL** — your Jira Cloud instance URL (e.g., `https://yourcompany.atlassian.net`)

**Step 5.** Start the application:

```
npm run dev
```

The app will be available at:

- **Frontend:** https://localhost:5173
- **API server:** https://localhost:3001
- **API docs (Swagger):** https://localhost:3001/api/docs

### Option B: Docker

**Step 1.** Build the Docker image:

```
docker build -t ticketcraft .
```

**Step 2.** Run the container with required environment variables:

```
docker run -d \
  --name ticketcraft \
  -p 3001:3001 \
  -e GEMINI_API_KEY=your-gemini-api-key \
  -e JIRA_BASE_URL=https://yourcompany.atlassian.net \
  -e GEMINI_DEFAULT_MODEL=gemini-3.1-pro-preview \
  -v ticketcraft-data:/app/server/data \
  ticketcraft
```

The `-v` flag mounts a volume for persistent storage (drafts, history, automation data).

The app will be available at http://localhost:3001.

### Option C: Kubernetes with Helm

**Step 1.** Create a Kubernetes Secret for the Gemini API key:

```
kubectl create secret generic ticketcraft-secrets \
  --from-literal=GEMINI_API_KEY=your-gemini-api-key \
  -n your-namespace
```

**Step 2.** Customize your values file. Start from the defaults:

```
cp helm/values.yaml my-values.yaml
```

At minimum, set:

- **env.JIRA_BASE_URL** — your Jira Cloud URL
- **envSecret.enabled** — set to `true` to load the Gemini key from the secret
- **ingress.enabled** — set to `true` and configure hosts for external access

**Step 3.** Install the chart:

```
helm upgrade --install ticketcraft ./helm -f my-values.yaml -n your-namespace
```

**For OpenShift deployments**, use the OpenShift-specific values as a starting point:

```
helm upgrade --install ticketcraft ./helm \
  -f ./helm/values-openshift.yaml \
  -n your-namespace
```

This enables an OpenShift Route instead of Ingress, applies stricter security contexts, and enables the Kubernetes Secret for the Gemini API key by default.

### Persistent Storage

TicketCraft stores drafts, session history, automation profiles, and admin settings as JSON files under `server/data/`. In Kubernetes, this is backed by a PersistentVolumeClaim (enabled by default in the Helm chart, 1Gi, ReadWriteOnce).

---

## 3. Configuration Reference

### Required Variables

| Variable | Description |
|---|---|
| GEMINI_API_KEY | Google Gemini API key. Powers all AI operations (scoring, improvement, questions, annotations, chat). |
| JIRA_BASE_URL | Base URL of your Jira Cloud instance (e.g., `https://yourcompany.atlassian.net`). |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 3001 | HTTPS listen port (primary app port). |
| HTTP_PORT | 3000 | Plain HTTP port. Redirects to HTTPS when TLS is configured. |
| HOST | 0.0.0.0 | Network interface to bind to. |
| CORS_ORIGIN | (empty) | Comma-separated allowed CORS origins. Leave empty when the server serves its own SPA (same-origin). |
| RATE_LIMIT_MAX | 100 | Maximum API requests per IP per 15-minute window. |
| TLS_CERT_PATH | (empty) | Path to TLS certificate file. When set with TLS_KEY_PATH, enables HTTPS. |
| TLS_KEY_PATH | (empty) | Path to TLS private key file. |
| GEMINI_DEFAULT_MODEL | gemini-3.1-pro-preview | Default Gemini model. Users can override per session. |
| ADMIN_EMAILS | (empty) | Comma-separated Jira email addresses allowed to access admin endpoints (settings, logs, Cursor config). |
| SESSION_TIMEOUT_MS | 1800000 | Inactivity timeout in milliseconds (default: 30 minutes). |
| AUTOMATION_TRIGGER_LABEL | readyForTicketCraftRefinement | Jira label that marks a ticket as ready for automated refinement. |
| AUTOMATION_DONE_LABEL | processedByTicketCraft | Jira label applied after a ticket has been processed by automation. |

### Available Gemini Models

- **gemini-3.1-pro-preview** — highest quality (default)
- **gemini-3.1-flash-lite-preview** — faster, lower cost
- **gemini-3-flash-preview** — previous generation flash model

---

## 4. Security Architecture

### Credential Handling

- **No credential storage.** User Jira email and API tokens exist only in browser memory during the active session. They are never written to the server's disk, database, cookies, or localStorage.
- **Header-based auth.** Credentials travel as request headers (`X-Jira-Email`, `X-Jira-Token`) over HTTPS on every API call. They are never included in URLs or server logs.
- **Gemini API key.** The Gemini key is configured server-side by the admin. It is never sent to or visible in the browser.

### Transport Security

- **HTTPS by default.** Both the server and the Vite dev server run over TLS.
- **Helmet.js.** The server applies a full suite of security headers: Content Security Policy, HSTS, X-Frame-Options, X-Content-Type-Options, and more.
- **CORS.** Cross-origin requests are blocked unless explicitly configured via `CORS_ORIGIN`.

### Rate Limiting and Timeouts

- **Rate limiting.** All API endpoints are rate-limited per IP (default: 100 requests per 15-minute window). Configure via `RATE_LIMIT_MAX`.
- **Session timeout.** After 30 minutes of inactivity (configurable via `SESSION_TIMEOUT_MS`), the session auto-expires. A 2-minute warning is displayed before expiration.

---

## 5. Automation Configuration

TicketCraft supports label-driven automation for hands-off refinement pipelines:

- **Trigger label** (`AUTOMATION_TRIGGER_LABEL`, default: `readyForTicketCraftRefinement`) — when a Jira ticket receives this label, it becomes eligible for automated scanning.
- **Done label** (`AUTOMATION_DONE_LABEL`, default: `processedByTicketCraft`) — applied after TicketCraft has processed the ticket.

These labels can be configured via environment variables or the admin settings panel in the UI. Teams can integrate this with Jira automation rules to create a fully automated refinement pipeline.

Admin users (those listed in `ADMIN_EMAILS`) can access the admin settings panel from the UI header to adjust automation settings at runtime.

---

## 6. API Reference

TicketCraft includes a built-in **Swagger UI** for interactive API documentation. Access it at:

```
https://your-ticketcraft-url/api/docs
```

### Endpoint Summary

| Method | Path | Description |
|---|---|---|
| GET | /api/health | Health check |
| POST | /api/session/validate | Validate Jira credentials and start a session |
| GET | /api/session/config | Get server configuration (Jira host, available models) |
| GET | /api/jira/ticket/:key | Fetch a Jira ticket by key |
| GET | /api/jira/ticket/:key/linked | Fetch linked tickets |
| PUT | /api/jira/ticket/:key | Update a ticket in Jira |
| POST | /api/jira/ticket/:key/attach | Upload an attachment to a ticket |
| POST | /api/ai/score | Score a ticket |
| POST | /api/ai/improve | Generate improvements |
| POST | /api/ai/questions | Generate guiding questions |
| POST | /api/ai/enrich | Re-generate improvements with user answers |
| POST | /api/ai/annotate | Generate annotations for changes |
| POST | /api/ai/refine | Refinement chat (iterative edits) |
| POST | /api/ai/document | Generate a supporting document |
| GET | /api/templates | List available templates |
| GET | /api/templates/:type | Get a specific template |
| POST | /api/export/markdown | Export a ticket as Markdown |
| GET | /api/drafts/:key | Get a saved draft for a ticket |
| POST | /api/drafts/:key | Save a draft |
| GET | /api/history | Get session history |
| POST | /api/repo/connect | Connect a repository |

### Authentication Headers

All authenticated endpoints require the following headers:

| Header | Required | Description |
|---|---|---|
| X-Jira-Email | Yes | Your Jira account email |
| X-Jira-Token | Yes | Your Jira API token |
| X-Gemini-Model | No | Override the default Gemini model |
| X-Gemini-Temperature | No | Override the default temperature |
| X-Github-Token | No | GitHub personal access token (for repo features) |
| X-Gitlab-Token | No | GitLab personal access token (for repo features) |

---

## 7. Troubleshooting

### TLS certificate warnings in the browser

- For local development, this is expected with self-signed certificates. Click through the browser warning or install `mkcert` and re-run `npm run generate-certs` to create trusted local certificates.
- For production, ensure proper CA-signed certificates are configured via `TLS_CERT_PATH` and `TLS_KEY_PATH` (or via your Ingress/Route TLS termination).

### Rate limit errors (HTTP 429)

- Users have exceeded the per-IP request limit. Increase `RATE_LIMIT_MAX` or adjust the rate-limiting window if needed.

### Session timeout too short

- Increase `SESSION_TIMEOUT_MS` in your environment variables. The default is 1800000 (30 minutes).

### Where to find logs

- Admin users (listed in `ADMIN_EMAILS`) can access the **Logs** panel from the header in the UI.
- Server-side logs are also written to `server/data/` on disk.

### Ticket not found (JIRA_BASE_URL mismatch)

- Check that the `JIRA_BASE_URL` environment variable points to the correct Jira instance.
