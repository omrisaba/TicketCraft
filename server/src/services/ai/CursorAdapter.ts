import { Agent } from '@cursor/sdk';
import type {
  Ticket,
  TicketChanges,
  TicketTemplateType,
} from 'ticketcraft-shared';
import { logBuffer } from '../logging/LogBuffer.js';
import { skillsMarkdownPromptSection } from './skillsPromptSection.js';

interface CursorImproveResult {
  improvedTicket: TicketChanges;
  codeInsights: string;
  generatedDocs: [];
  mermaidDiagrams: [];
}

export class CursorAdapter {
  private apiKey: string;
  private model: string;
  private repoDir: string;

  constructor(apiKey: string, model: string, repoDir: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.repoDir = repoDir;
  }

  async improveTicket(
    ticket: Ticket,
    options?: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      referenceContent?: string;
      skillsMarkdown?: string;
    },
  ): Promise<CursorImproveResult> {
    const prompt = this.buildPrompt(ticket, options);
    const start = Date.now();
    const sm = options?.skillsMarkdown?.trim();

    logBuffer.add({
      category: 'llm',
      operation: 'cursorImprove:start',
      model: `cursor:${this.model}`,
      promptLength: prompt.length,
      durationMs: 0,
      success: true,
      meta: {
        skillsProvided: Boolean(sm),
        skillsLength: sm?.length ?? 0,
      },
    });

    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await Agent.prompt(prompt, {
          apiKey: this.apiKey,
          model: { id: this.model },
          local: { cwd: this.repoDir },
        });

        const duration = Date.now() - start;
        const text = result.result || '';

        logBuffer.add({
          category: 'llm',
          operation: 'cursorImprove:done',
          model: `cursor:${this.model}`,
          durationMs: duration,
          responseLength: text.length,
          success: result.status === 'finished',
          meta: { status: result.status, attempt },
        });

        if (result.status !== 'finished') {
          throw new Error(`Cursor agent did not finish successfully (status: ${result.status})`);
        }

        if (!text) {
          throw new Error('Cursor agent returned empty response');
        }

        return this.parseResult(text, ticket);
      } catch (err: any) {
        const duration = Date.now() - start;
        logBuffer.add({
          category: 'llm',
          operation: 'cursorImprove:error',
          model: `cursor:${this.model}`,
          durationMs: duration,
          success: false,
          error: err?.message,
          meta: { attempt },
        });

        if (attempt >= maxAttempts) throw err;
        console.log(`[CURSOR] Attempt ${attempt} failed (${err.message}), retrying...`);
      }
    }

    throw new Error('Cursor agent failed after all attempts');
  }

  private buildPrompt(
    ticket: Ticket,
    options?: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      referenceContent?: string;
      skillsMarkdown?: string;
    },
  ): string {
    let templateInstructions = '';
    if (options?.templateType) {
      templateInstructions = `\n## TEMPLATE\n\nThis ticket should follow the "${options.templateType}" template:\n`
        + '- bug: Include reproduction steps, expected vs actual behavior, environment info, severity.\n'
        + '- feature: Include user story, acceptance criteria, scope, out of scope, technical notes.\n'
        + '- spike: Include research questions, timebox, expected output, decision criteria.\n'
        + '- tech-debt: Include current state, desired state, impact, migration plan, risks.\n';
    }

    let answersSection = '';
    if (options?.userAnswers && Object.keys(options.userAnswers).length > 0) {
      answersSection = '\n## USER-PROVIDED CONTEXT\n\nThe user answered guiding questions:\n';
      for (const [question, answer] of Object.entries(options.userAnswers)) {
        answersSection += `Q: ${question}\nA: ${answer}\n\n`;
      }
      answersSection += 'Weave these answers naturally into the improved ticket.\n';
    }

    let linkedSection = '';
    if (options?.linkedTickets?.length) {
      linkedSection = '\n## LINKED TICKETS\n\n';
      for (const lt of options.linkedTickets) {
        linkedSection += `- ${lt.key}: ${lt.summary} (${lt.status})\n`;
        if (lt.description) linkedSection += `  Description: ${lt.description}\n`;
      }
    }

    let refSection = '';
    if (options?.referenceContent) {
      refSection = `\n## REFERENCE DOCUMENTS\n\n${options.referenceContent}\n`;
    }

    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);

    const commentsSection = ticket.comments.length > 0
      ? `\nComments (${ticket.comments.length}):\n` + ticket.comments.slice(0, 10).map((c) => `  - ${c.author}: ${c.body}`).join('\n')
      : '';

    return `You are an expert Jira ticket writer embedded in a real codebase. Your job is to transform a rough or incomplete Jira ticket into an exemplary, developer-ready ticket by grounding it in the actual code.

## THE TICKET TO IMPROVE

Key: ${ticket.key}
Type: ${ticket.issueType}
Summary: ${ticket.summary}
Description:
${ticket.description || '(empty)'}

Status: ${ticket.status} | Priority: ${ticket.priority || '(not set)'} | Assignee: ${ticket.assignee || '(unassigned)'}
Reporter: ${ticket.reporter || '(unknown)'}
Labels: ${ticket.labels.length > 0 ? ticket.labels.join(', ') : '(none)'}
Story Points: ${ticket.storyPoints ?? '(not set)'}
Acceptance Criteria: ${ticket.acceptanceCriteria || '(none)'}
${commentsSection}${linkedSection}${answersSection}${templateInstructions}${refSection}${skillsSection}

## YOUR TASK

You have full access to the codebase. Use it. Before writing anything:

1. **Locate the relevant code.** Search for files, classes, functions, APIs, and modules related to this ticket. Read them. Understand the current implementation, the patterns used, and the tech stack.

2. **Understand the scope.** Identify what needs to change, what's affected, and what the boundaries are. Look at tests, configs, and related modules.

3. **Then write the ticket** with the authority of someone who has read the code:

   - **Summary**: One line, specific, actionable. A developer should know what to do from the summary alone.

   - **Description**: Structured with Markdown headings. Must include:
     - **Context/Background**: Why this work matters, grounded in the current system state
     - **Current Behavior** (for bugs) or **Current State** (for features): What exists today, referencing actual files/modules
     - **Desired Behavior/Outcome**: What should change, with specifics
     - **Technical Approach** (if inferable): Suggested implementation referencing real code paths, services, patterns found in the codebase
     - **Scope**: What's in and out of scope
     - **Dependencies/Risks**: Other systems or modules affected

   - **Acceptance Criteria**: Specific, testable checklist items using "- [ ]" syntax. Each criterion should be verifiable. Reference real behaviors, APIs, or UI elements from the codebase where applicable.

   - **Labels**: Based on the tech stack and domain you found in the code (e.g., "backend", "api", "auth", "database", "frontend", "react")

   - **Story Points**: Estimate based on the actual complexity you observed in the code (use Fibonacci: 1, 2, 3, 5, 8, 13)

## OUTPUT FORMAT

Respond with ONLY this JSON — no explanation before or after:

{
  "improvedTicket": {
    "summary": "<improved summary>",
    "description": "<improved description in Markdown>",
    "acceptanceCriteria": "<acceptance criteria with - [ ] checkboxes>",
    "labels": ["<label1>", "<label2>"],
    "storyPoints": <number or null>
  },
  "codeInsights": "<2-3 sentences about what you found in the codebase that informed your improvements>"
}

## QUALITY STANDARDS

- Every claim in the description must be grounded in code you actually read
- Don't invent module names, file paths, or API endpoints — only reference what exists
- If you can't find relevant code, say so honestly in the description rather than fabricating
- Use clean Markdown: ## headings, **bold**, - bullet lists, 1. numbered lists, \`code\`, \`\`\`code blocks\`\`\`
- No HTML tags
- Acceptance criteria must be independently testable — not vague ("works correctly") but specific ("returns 200 with user object when valid JWT is provided")`;
  }

  private parseResult(text: string, ticket: Ticket): CursorImproveResult {
    let cleaned = text.trim();

    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logBuffer.add({
        category: 'llm',
        operation: 'cursorImprove:parseError',
        model: `cursor:${this.model}`,
        durationMs: 0,
        success: false,
        error: 'No JSON object found in response',
        meta: { responsePreview: text.slice(0, 500) },
      });
      throw new Error('Cursor agent did not return valid JSON');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const improved = parsed.improvedTicket || parsed;

      return {
        improvedTicket: {
          summary: improved.summary || ticket.summary,
          description: improved.description || ticket.description || undefined,
          acceptanceCriteria: improved.acceptanceCriteria || undefined,
          labels: improved.labels || ticket.labels,
          storyPoints: improved.storyPoints ?? ticket.storyPoints ?? undefined,
        },
        codeInsights: parsed.codeInsights || '',
        generatedDocs: [],
        mermaidDiagrams: [],
      };
    } catch {
      logBuffer.add({
        category: 'llm',
        operation: 'cursorImprove:parseError',
        model: `cursor:${this.model}`,
        durationMs: 0,
        success: false,
        error: 'JSON.parse failed',
        meta: { responsePreview: jsonMatch[0].slice(0, 500) },
      });
      throw new Error('Failed to parse Cursor agent JSON response');
    }
  }
}
