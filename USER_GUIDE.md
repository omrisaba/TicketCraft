# TicketCraft User Guide

## 1. Introduction

TicketCraft is an AI-powered Jira ticket quality tool. It uses Google Gemini to analyze your Jira tickets, score them across multiple quality dimensions, ask guiding questions, rewrite descriptions and acceptance criteria, suggest story points, and sync the approved improvements back to Jira.

**What you can do with TicketCraft:**

- Score any Jira ticket on a 0–100 scale across six quality dimensions
- Get AI-generated guiding questions that target weak areas
- Improve ticket descriptions, acceptance criteria, labels, and story points with one click
- Review changes in a side-by-side diff view with AI-written annotations explaining each change
- Refine improvements through a conversational chat interface
- Export improved tickets as Markdown
- Push approved changes directly back to Jira
- Create new Jira tickets from improvements
- Connect repository context (GitHub/GitLab) for code-aware improvements

---

## 2. Prerequisites

- **Jira Cloud account** with access to the target Jira instance
- **Jira API token** — generate one at https://id.atlassian.com/manage-profile/security/api-tokens
- A modern web browser (Chrome, Firefox, Edge, Safari)

---

## 3. Getting Started

### Step 1: Open TicketCraft

Navigate to the URL provided by your administrator (e.g., `https://ticketcraft.yourcompany.com`).

### Step 2: Start a Session

On the Session Start screen you will see:

- **Jira Host** — pre-configured by the admin, displayed for your reference
- **Jira Email** — enter the email address associated with your Jira account
- **Jira API Token** — enter your personal Jira API token
- **Gemini Model** — select from the dropdown (the admin's default is pre-selected)

**Loading credentials from a file (optional):** You can click "Load from File" to select a local JSON file containing your credentials. The file is read entirely in the browser and is never uploaded to the server. The expected format is:

```
{
  "jiraEmail": "you@company.com",
  "jiraApiToken": "your-token-here",
  "githubToken": "optional",
  "gitlabToken": "optional"
}
```

### Step 3: Validate and Enter

Click **Start Session**. TicketCraft validates your Jira credentials by making a test call to the Jira API. On success, you enter the main workspace.

**Important notes about your session:**

- Your credentials are held **only in browser memory** for the duration of the session. They are never stored on the server, in cookies, or in localStorage.
- The session expires after **30 minutes of inactivity**. You will see a warning 2 minutes before expiration.
- Click **End Session** in the header at any time to manually wipe your credentials.

---

## 4. Core Workflow

### 4.1 Fetch and Score a Ticket

1. Enter a Jira ticket key (e.g., `PROJ-1234`) in the ticket input field.
2. Click **Fetch & Score**.
3. TicketCraft fetches the ticket from Jira, optionally fetches up to 5 linked tickets for context, and sends the content to Gemini for scoring.

**The Score Card** shows:

- **Overall score** — 0 to 100
- **Six dimension scores**, each with specific feedback:
  - **Clarity** — Is the ticket easy to understand?
  - **Completeness** — Does it contain all necessary information?
  - **Actionability** — Can a developer act on it immediately?
  - **Testability** — Are success criteria defined and verifiable?
  - **Formatting** — Is the content well-structured?
  - **Context** — Is there enough background information?

### 4.2 Guiding Questions

If the score reveals weak dimensions, you can generate **Guiding Questions** — targeted questions the AI asks to help you fill in missing information.

1. Click **Generate Questions**.
2. Answer the questions in the provided text fields. You don't need to answer all of them — any additional context helps.
3. Click **Improve with Answers** to feed your responses into the improvement step.

You can also skip questions and go directly to improvement.

### 4.3 Improve the Ticket

Click **Improve** (or **Improve with Answers** if you answered guiding questions). TicketCraft generates:

- **Rewritten description** — clearer, more complete version of the ticket body
- **Acceptance criteria** — specific, testable criteria (generated or improved)
- **Story point suggestion** — based on estimated complexity
- **Labels** — suggested labels based on content analysis

**Using Templates:** Before improving, you can optionally select a template to guide the AI's output structure:

- **Bug** — steps to reproduce, expected vs actual behavior, severity
- **Feature** — user story format, acceptance criteria, scope
- **Spike** — research questions, time-box, deliverables
- **Tech Debt** — current state, desired state, impact, migration plan

**Detail Level:** You can set the detail level (high, medium, low) to control how verbose the improvements are.

### 4.4 Review Changes (Diff View)

After improvement, the **Diff View** shows a side-by-side comparison of the original and improved versions for each field:

- Summary
- Description
- Acceptance criteria
- Labels
- Story points

Each change includes **AI-written annotations** explaining why the change was made. This helps you understand the reasoning and decide whether to accept each modification.

### 4.5 Refinement Chat

Not satisfied with a specific part of the improvement? Use the **Refinement Chat** to make iterative adjustments:

1. Type a natural-language instruction (e.g., "Make the acceptance criteria more specific about error handling" or "Remove the migration plan section").
2. The AI regenerates the improvement incorporating your feedback.
3. Repeat as needed until you're satisfied.

### 4.6 Export or Sync to Jira

Once you're happy with the improvements:

- **Export as Markdown** — download the improved ticket as a `.md` file for offline review or sharing
- **Sync to Jira** — push the approved changes directly back to the Jira ticket. This updates the ticket's description, acceptance criteria, story points, and labels.
- **Create New Ticket** — instead of updating the existing ticket, create a brand new Jira issue with the improved content

---

## 5. Create from Scratch (Compose Workspace)

TicketCraft lets you create brand new Jira tickets from a rough description — no existing ticket required. After logging in, use the **Improve Existing / Create from Scratch** toggle at the top of the page to switch to the Compose Workspace.

### 5.1 Setup

1. **Describe the work** — write a free-text description of what needs to be done. This can be rough notes, a chat message, or a bullet list — the AI will transform it into a structured ticket.
2. **Project** — search and select the target Jira project.
3. **Issue Type** — choose from the available types (e.g., Story, Bug, Task). Sub-task types are excluded here since this creates a top-level ticket.
4. **Detail Level** — set to High, Medium, or Low to control how verbose the generated ticket will be.
5. **Assignee** *(optional)* — search for a user in the selected project and assign them to the ticket.
6. **Template** *(optional)* — select a template (Bug, Feature, Spike, Tech Debt) to guide the structure of the generated ticket.
7. **Repository** *(optional)* — connect a GitHub or GitLab repository for code-aware generation.
8. **Reference Files** *(optional)* — add URLs or upload local files as additional context for the AI.

Click **Generate Ticket** to submit.

### 5.2 Review the Generated Ticket

After the AI generates the ticket, you land on the **Review** step where you can:

- **Edit** the summary, description, and acceptance criteria directly in the form
- See the suggested **labels** and **story points**
- Confirm the project and issue type

From here you have several options:

- **Back** — return to setup to change your description or settings
- **Regenerate** — re-run the AI to get a fresh version
- **Create Ticket** — create the ticket in Jira immediately
- **Break Down into Tasks** — split the ticket into subtasks before creating (see below)

### 5.3 Break Down into Tasks

Click **Break Down into Tasks** to have the AI decompose the ticket into implementable subtasks. The breakdown step shows:

- **Parent ticket** — the composed ticket that will become the parent
- **Subtask list** — each with a summary, description, acceptance criteria, labels, and story points
- **Rationale** — the AI's explanation of how it divided the work
- **Story point totals** — compared against the parent's estimate

You can reorder, edit, add, or remove subtasks before creating. Click **Create All (N tickets)** to batch-create the parent ticket and all subtasks in Jira in one operation.

### 5.4 Done

After creation, TicketCraft shows:

- **Single ticket** — a link to the newly created Jira issue
- **Batch (parent + subtasks)** — links to the parent and each subtask, plus any errors if some subtasks failed to create

Click **Create Another Ticket** to start a fresh composition.

---

## 6. Additional Features

### 6.1 Linked Ticket Context

When fetching a ticket, TicketCraft automatically retrieves up to 5 linked tickets (parent, subtasks, related issues). This context is passed to the AI so improvements account for the broader work context — avoiding duplication and ensuring consistency with related tickets.

### 6.2 Repository Context

Connect a source code repository to give the AI awareness of your codebase:

1. In the **Repo Connector** panel, enter the repository URL (GitHub or GitLab).
2. Optionally provide a **GitHub Token** or **GitLab Token** (loaded from your credentials file or entered at session start) for private repositories.
3. TicketCraft clones or connects to the repository and generates a usage summary (languages, file tree, key patterns).

This context makes improvements more technically accurate — the AI can reference actual code structure, naming conventions, and architecture in its suggestions.

### 6.3 Reference Links

Add external URLs (documentation pages, design docs, RFCs) to the **Reference Links** panel. TicketCraft fetches the content from these URLs and includes it in the AI prompts. This is useful when a ticket references external requirements or specifications.

### 6.4 Ticket Scanner (Pending Reviews)

The Ticket Scanner lets you batch-process multiple tickets:

1. Enter a **JQL query** (e.g., `project = PROJ AND status = "To Do" AND labels = readyForReview`).
2. TicketCraft scans matching tickets and queues them for review.
3. Work through the queue — each ticket opens pre-loaded in the workspace with its score already calculated.

This is useful for sprint grooming or backlog refinement sessions.

### 6.5 Automation

TicketCraft supports label-driven automation for hands-off refinement:

- **Trigger label** (default: `readyForTicketCraftRefinement`) — when a Jira ticket receives this label, it becomes eligible for automated scanning.
- **Done label** (default: `processedByTicketCraft`) — applied after TicketCraft has processed the ticket.

Ask your administrator about the specific labels configured for your instance.

### 6.6 Session History

The header displays a **History** dropdown listing all tickets you've improved during the current session. Click any entry to revisit its score and improvements. History is persisted on the server, so it survives page refreshes within the same session.

### 6.7 Drafts

TicketCraft auto-saves your work as you go. If you navigate away or your session times out mid-improvement, the next time you load the same ticket, you'll be offered the option to **resume from your draft** or start fresh.

### 6.8 Ticket Graph

The **Ticket Map** provides a visual graph of the current ticket's relationships — parent, subtasks, and linked issues — rendered as an interactive node diagram. Click any node to navigate to that ticket.

### 6.9 Create New Ticket

From the improvement view, click **Create New** to open a modal that lets you create a brand new Jira issue populated with the improved content. Choose the project, issue type, and other fields before submitting.

---

## 7. Security and Privacy

- **No credential storage.** Your Jira email and API token exist only in browser memory during the active session. They are never written to the server's disk, database, cookies, or localStorage.
- **Encrypted transport.** All communication between your browser and TicketCraft uses HTTPS.
- **Gemini API key.** The Gemini key is configured server-side by the admin. It is never sent to or visible in the browser.
- **Session timeout.** After 30 minutes of inactivity, the session auto-expires and all credentials are wiped. A 2-minute warning is displayed before expiration.
- **Rate limiting.** API requests are rate-limited to prevent abuse.

---

## 8. Troubleshooting

### "Invalid Jira credentials"

- Verify your Jira email matches your Atlassian account email exactly.
- Confirm your API token is still valid at https://id.atlassian.com/manage-profile/security/api-tokens. Tokens can expire or be revoked.
- Ensure you have access to the Jira instance configured by the admin.

### "Session expired"

- Sessions auto-expire after 30 minutes of inactivity. Click **Start Session** again and re-enter your credentials.
- If this happens frequently during long refinement sessions, ask your admin to increase the session timeout.

### Ticket not found

- Verify the ticket key is correct (e.g., `PROJ-1234`, not just `1234`).
- Confirm your Jira account has permission to view the ticket.

### AI improvements seem generic

- Try connecting a **repository** for code-aware context.
- Add **reference links** to relevant documentation or design docs.
- Use **guiding questions** to provide domain-specific context the AI wouldn't otherwise have.
- Select an appropriate **template** (Bug, Feature, Spike, Tech Debt) to guide the output structure.
- Increase the **detail level** to "high" for more thorough analysis.

---

## 9. Glossary

| Term | Definition |
|---|---|
| **Scoring dimensions** | The six quality axes: clarity, completeness, actionability, testability, formatting, context. |
| **Guiding questions** | AI-generated questions targeting weak scoring dimensions to elicit missing context. |
| **Diff view** | Side-by-side comparison of original and improved ticket content. |
| **Annotations** | AI-written explanations attached to each change in the diff view. |
| **Refinement chat** | Iterative conversation with the AI to adjust improvements. |
| **Templates** | Predefined structures (Bug, Feature, Spike, Tech Debt) that guide the AI's output format. |
| **Ticket Scanner** | Batch mode that uses a JQL query to find and queue multiple tickets for review. |
| **Automation labels** | Jira labels used to trigger and track automated refinement workflows. |
| **Detail level** | Controls verbosity of AI output: high, medium, or low. |
