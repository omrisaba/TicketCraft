import { Agent } from '@cursor/sdk';
import type {
  Ticket,
  TicketChanges,
  TicketTemplateType,
  DetailLevel,
} from 'ticketcraft-shared';
import { logBuffer } from '../logging/LogBuffer.js';
import { AppError } from '../../middleware/errorHandler.js';
import { skillsMarkdownPromptSection } from './skillsPromptSection.js';
import { detailLevelPromptSection } from './detailLevelPrompt.js';

export class CursorAdapter {
  private apiKey: string;
  private model: string;
  private repoDir: string;

  constructor(apiKey: string, model: string, repoDir: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.repoDir = repoDir;
  }

  async exploreForImprove(
    ticket: Ticket,
    options?: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<string> {
    const prompt = this.buildImproveExplorationPrompt(ticket, options);
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

    return this.runAgent(prompt, 'cursorImprove');
  }

  async exploreForCompose(
    freeText: string,
    options?: {
      issueType?: string;
      templateType?: TicketTemplateType;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<string> {
    const prompt = this.buildComposeExplorationPrompt(freeText, options);

    logBuffer.add({
      category: 'llm',
      operation: 'cursorCompose:start',
      model: `cursor:${this.model}`,
      promptLength: prompt.length,
      durationMs: 0,
      success: true,
    });

    return this.runAgent(prompt, 'cursorCompose');
  }

  async exploreForBreakdown(
    ticket: TicketChanges,
    options?: {
      issueType?: string;
      subtaskType?: string;
      maxTasks?: number;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<string> {
    const prompt = this.buildBreakdownExplorationPrompt(ticket, options);

    logBuffer.add({
      category: 'llm',
      operation: 'cursorBreakdown:start',
      model: `cursor:${this.model}`,
      promptLength: prompt.length,
      durationMs: 0,
      success: true,
    });

    return this.runAgent(prompt, 'cursorBreakdown');
  }

  private async runAgent(prompt: string, operationPrefix: string): Promise<string> {
    const maxAttempts = 2;
    const start = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const agent = await Agent.create({
        apiKey: this.apiKey,
        model: { id: this.model },
        local: { cwd: this.repoDir },
      });

      try {
        const run = await agent.send(prompt);
        const result = await run.wait();
        const duration = Date.now() - start;

        if (result.status !== 'finished') {
          throw new Error(`Cursor agent did not finish successfully (status: ${result.status})`);
        }

        let fullText = result.result || '';

        if (run.supports('conversation')) {
          const convo = await run.conversation();
          const assistantTexts: string[] = [];
          for (const turn of convo) {
            if (turn.type !== 'agentConversationTurn') continue;
            for (const step of turn.turn.steps) {
              if (step.type === 'assistantMessage') {
                assistantTexts.push(step.message.text);
              }
            }
          }
          const combined = assistantTexts.join('\n');
          if (combined.length > fullText.length) fullText = combined;
        }

        if (!fullText) {
          throw new Error('Cursor agent returned empty response');
        }

        logBuffer.add({
          category: 'llm',
          operation: `${operationPrefix}:done`,
          model: `cursor:${this.model}`,
          durationMs: duration,
          responseLength: fullText.length,
          success: true,
          meta: { attempt },
        });

        return fullText;
      } catch (err: any) {
        logBuffer.add({
          category: 'llm',
          operation: `${operationPrefix}:error`,
          model: `cursor:${this.model}`,
          durationMs: Date.now() - start,
          success: false,
          error: err?.message,
          meta: { attempt },
        });

        if (attempt >= maxAttempts) {
          throw new AppError(502, 'CURSOR_AGENT_ERROR', `Cursor agent failed: ${err.message}`);
        }
        console.log(`[CURSOR] Attempt ${attempt} failed (${err.message}), retrying...`);
      } finally {
        await agent[Symbol.asyncDispose]();
      }
    }

    throw new AppError(502, 'CURSOR_AGENT_ERROR', 'Cursor agent failed after all attempts');
  }

  private buildImproveExplorationPrompt(
    ticket: Ticket,
    options?: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): string {
    let answersSection = '';
    if (options?.userAnswers && Object.keys(options.userAnswers).length > 0) {
      answersSection = '\n## USER-PROVIDED CONTEXT\n\n';
      for (const [question, answer] of Object.entries(options.userAnswers)) {
        answersSection += `Q: ${question}\nA: ${answer}\n\n`;
      }
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
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    const commentsSection = ticket.comments.length > 0
      ? `\nComments (${ticket.comments.length}):\n` + ticket.comments.slice(0, 10).map((c) => `  - ${c.author}: ${c.body}`).join('\n')
      : '';

    return `You are a senior software engineer embedded in a real codebase. Your job is to explore the code and produce a detailed technical analysis for the following Jira ticket.

## THE TICKET

Key: ${ticket.key}
Type: ${ticket.issueType}
Summary: ${ticket.summary}
Description:
${ticket.description || '(empty)'}

Status: ${ticket.status} | Priority: ${ticket.priority || '(not set)'} | Assignee: ${ticket.assignee || '(unassigned)'}
Labels: ${ticket.labels.length > 0 ? ticket.labels.join(', ') : '(none)'}
Story Points: ${ticket.storyPoints ?? '(not set)'}
Acceptance Criteria: ${ticket.acceptanceCriteria || '(none)'}
${commentsSection}${linkedSection}${answersSection}${refSection}${skillsSection}${detailSection}

## YOUR TASK

Explore the codebase thoroughly. Then write a detailed technical analysis covering:

1. **Relevant code**: Which files, classes, functions, APIs, and modules are related to this ticket? Quote specific file paths and function names.
2. **Current implementation**: How does the current code work in the area this ticket affects? What patterns and tech stack are used?
3. **Scope of change**: What needs to change? What files/modules would be affected? What are the boundaries?
4. **Dependencies and risks**: What other systems or modules could be impacted?
5. **Complexity estimate**: Based on what you see in the code, how complex is this work? (simple, moderate, complex)
6. **Suggested approach**: Based on the codebase patterns, how would you implement this?

Write your analysis in plain text. Be thorough and reference real file paths and code.`;
  }

  private buildComposeExplorationPrompt(
    freeText: string,
    options?: {
      issueType?: string;
      templateType?: TicketTemplateType;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): string {
    const issueTypeHint = options?.issueType ? `\nTarget issue type: ${options.issueType}` : '';
    let refSection = '';
    if (options?.referenceContent) {
      refSection = `\n## REFERENCE DOCUMENTS\n\n${options.referenceContent}\n`;
    }
    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    return `You are a senior software engineer embedded in a real codebase. A user wants to create a new Jira ticket from the description below. Your job is to explore the code and produce a detailed technical analysis.

## USER'S DESCRIPTION
${freeText}
${issueTypeHint}${refSection}${skillsSection}${detailSection}

## YOUR TASK

Explore the codebase thoroughly. Then write a detailed technical analysis covering:

1. **Relevant code**: Which files, classes, functions, and modules relate to the user's description? Quote specific file paths.
2. **Current state**: How does the code currently work in this area?
3. **Architecture**: What patterns, frameworks, and tech stack are used?
4. **Scope**: What would need to change or be created?
5. **Dependencies**: What other parts of the codebase would be affected?
6. **Complexity estimate**: Simple, moderate, or complex?

Write your analysis in plain text. Be thorough and reference real file paths and code.`;
  }

  private buildBreakdownExplorationPrompt(
    ticket: TicketChanges,
    options?: {
      issueType?: string;
      subtaskType?: string;
      maxTasks?: number;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): string {
    let refSection = '';
    if (options?.referenceContent) {
      refSection = `\n## REFERENCE DOCUMENTS\n\n${options.referenceContent}\n`;
    }
    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    return `You are a senior engineering lead embedded in a real codebase. A ticket needs to be broken down into implementable subtasks. Explore the code to understand the scope.

## PARENT TICKET
Summary: ${ticket.summary || '(no summary)'}
Description: ${ticket.description || '(no description)'}
Acceptance Criteria: ${ticket.acceptanceCriteria || '(none)'}
Labels: ${ticket.labels?.join(', ') || '(none)'}
Story Points: ${ticket.storyPoints ?? '(not set)'}
${refSection}${skillsSection}${detailSection}

## YOUR TASK

Explore the codebase thoroughly. Then write a detailed analysis covering:

1. **Affected areas**: Which files, modules, and services are involved?
2. **Current implementation**: How does the code work in these areas today?
3. **Work breakdown**: What are the distinct pieces of work? What depends on what?
4. **File-level mapping**: For each piece of work, which specific files would be modified or created?
5. **Risk areas**: What parts are tricky or have dependencies?

Write your analysis in plain text. Be thorough and reference real file paths and code.`;
  }
}
