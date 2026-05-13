import type {
  Ticket,
  TicketScore,
  TicketChanges,
  GuidingQuestion,
  Annotation,
  GeneratedDocument,
  MermaidDiagram,
  TicketTemplateType,
  DetailLevel,
  DimensionScore,
  RefinementMessage,
  RefineResponse,
  RepoUsageSummary,
  SubtaskProposal,
} from 'ticketcraft-shared';
import type { AIProvider } from '../interfaces/AIProvider.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logBuffer } from '../logging/LogBuffer.js';
import { skillsMarkdownPromptSection } from './skillsPromptSection.js';
import { detailLevelPromptSection } from './detailLevelPrompt.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiAdapter implements AIProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, model: string, temperature = 0.3) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
  }

  private async generateContent(
    prompt: string,
    jsonMode = true,
    operation = 'unknown',
    extraLogMeta?: Record<string, unknown>,
  ): Promise<string> {
    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const startTime = Date.now();

    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: 8192,
      },
    };

    if (jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const durationMs = Date.now() - startTime;
        logBuffer.add({ category: 'llm', operation, model: this.model, temperature: this.temperature, promptLength: prompt.length, durationMs, success: false, error: `HTTP ${response.status}` });
        if (response.status === 401 || response.status === 403) {
          throw new AppError(401, 'GEMINI_AUTH_FAILED', 'Gemini API key is invalid.');
        }
        throw new AppError(502, 'GEMINI_API_ERROR', `Gemini API error (upstream ${response.status}).`, errBody);
      }

      const data = await response.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const durationMs = Date.now() - startTime;
      const tokenMeta = data.usageMetadata;

      if (!text) {
        logBuffer.add({ category: 'llm', operation, model: this.model, temperature: this.temperature, promptLength: prompt.length, durationMs, success: false, error: 'Empty response' });
        throw new AppError(500, 'GEMINI_EMPTY_RESPONSE', 'Gemini returned an empty response.');
      }

      const mergedMeta: Record<string, unknown> = { ...(extraLogMeta || {}) };
      if (tokenMeta) {
        mergedMeta.promptTokens = tokenMeta.promptTokenCount;
        mergedMeta.responseTokens = tokenMeta.candidatesTokenCount;
        mergedMeta.totalTokens = tokenMeta.totalTokenCount;
      }
      logBuffer.add({
        category: 'llm', operation, model: this.model, temperature: this.temperature,
        promptLength: prompt.length, responseLength: text.length, durationMs, success: true,
        meta: Object.keys(mergedMeta).length > 0 ? mergedMeta : undefined,
      });

      return text;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const durationMs = Date.now() - startTime;
      logBuffer.add({ category: 'llm', operation, model: this.model, temperature: this.temperature, promptLength: prompt.length, durationMs, success: false, error: (err as Error).message });
      throw err;
    }
  }

  private parseJson<T>(text: string): T {
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      throw new AppError(500, 'GEMINI_PARSE_ERROR', 'Failed to parse Gemini response as JSON.');
    }
  }

  private formatTicketForPrompt(ticket: Ticket, linkedTickets?: Ticket[]): string {
    const parts = [
      `Ticket Key: ${ticket.key}`,
      `Type: ${ticket.issueType}`,
      `Summary: ${ticket.summary}`,
      `Description: ${ticket.description || '(empty)'}`,
      `Status: ${ticket.status}`,
      `Priority: ${ticket.priority || '(not set)'}`,
      `Labels: ${ticket.labels.length > 0 ? ticket.labels.join(', ') : '(none)'}`,
      `Story Points: ${ticket.storyPoints ?? '(not set)'}`,
      `Acceptance Criteria: ${ticket.acceptanceCriteria || '(none)'}`,
      `Assignee: ${ticket.assignee || '(unassigned)'}`,
      `Reporter: ${ticket.reporter || '(unknown)'}`,
    ];

    if (ticket.comments.length > 0) {
      parts.push(`\nComments (${ticket.comments.length}):`);
      ticket.comments.slice(0, 10).forEach((c) => {
        parts.push(`  - ${c.author}: ${c.body}`);
      });
    }

    if (ticket.attachments.length > 0) {
      parts.push(`\nAttachments: ${ticket.attachments.map((a) => a.filename).join(', ')}`);
    }

    if (linkedTickets && linkedTickets.length > 0) {
      parts.push(`\nLinked Tickets:`);
      linkedTickets.forEach((lt) => {
        parts.push(`  - ${lt.key}: ${lt.summary} (${lt.status})`);
        if (lt.description) parts.push(`    Description: ${lt.description}`);
      });
    }

    return parts.join('\n');
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const url = `${GEMINI_API_BASE}/models?key=${this.apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async scoreTicket(ticket: Ticket, linkedTickets?: Ticket[], repoContextPrompt?: string, referenceContent?: string): Promise<TicketScore> {
    const repoSection = repoContextPrompt ? `\n\nProject context (use this to evaluate whether the ticket is specific to the codebase):\n${repoContextPrompt}\n` : '';
    const refSection = referenceContent ? `\n\nReference documents (consider whether the ticket leverages this context):\n${referenceContent}\n` : '';
    const prompt = `You are a Jira ticket quality evaluator. Analyze the following Jira ticket and score it across 6 dimensions.

${this.formatTicketForPrompt(ticket, linkedTickets)}${repoSection}${refSection}

Score each dimension from 0-10:
1. clarity (weight 20%) - Is the description unambiguous? Clear language? No jargon without explanation?
2. completeness (weight 25%) - Does it have a description, acceptance criteria, labels, priority, assignee?
3. actionability (weight 20%) - Can a developer start working from this ticket alone?
4. testability (weight 15%) - Are acceptance criteria specific and verifiable?
5. formatting (weight 10%) - Proper structure, headings, lists? Not a wall of text?
6. context (weight 10%) - Links to related tickets, docs, designs, screenshots?

Return JSON:
{
  "overall": <weighted score 0-100>,
  "dimensions": [
    { "id": "<dimension_id>", "name": "<readable name>", "score": <0-10>, "maxScore": 10, "weight": <0.0-1.0>, "feedback": "<specific feedback for this dimension>" }
  ],
  "summary": "<1-2 sentence overall assessment>"
}`;

    const text = await this.generateContent(prompt, true, 'scoreTicket');
    return this.parseJson<TicketScore>(text);
  }

  async improveTicket(
    ticket: Ticket,
    options?: {
      templateType?: TicketTemplateType;
      userAnswers?: Record<string, string>;
      linkedTickets?: Ticket[];
      repoContextPrompt?: string;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<{
    improvedTicket: TicketChanges;
    generatedDocs: GeneratedDocument[];
    mermaidDiagrams: MermaidDiagram[];
  }> {
    let templateInstructions = '';
    if (options?.templateType) {
      templateInstructions = `\nThe ticket should follow the "${options.templateType}" template structure.
- bug: Include reproduction steps, expected vs actual behavior, environment info, severity.
- feature: Include user story, acceptance criteria, scope, out of scope, technical notes.
- spike: Include research questions, timebox, expected output, decision criteria.
- tech-debt: Include current state, desired state, impact, migration plan, risks.`;
    }

    let answersSection = '';
    if (options?.userAnswers && Object.keys(options.userAnswers).length > 0) {
      answersSection = '\n\nThe user provided additional context through guiding questions:\n';
      for (const [question, answer] of Object.entries(options.userAnswers)) {
        answersSection += `Q: ${question}\nA: ${answer}\n\n`;
      }
      answersSection += 'Weave these answers naturally into the improved ticket.';
    }

    const repoSection = options?.repoContextPrompt
      ? `\n\nProject context (reference real modules, services, and patterns from this codebase in your improvements):\n${options.repoContextPrompt}\n`
      : '';

    const refSection = options?.referenceContent
      ? `\n\nAdditional reference documents provided by the user (incorporate relevant information into the ticket):\n${options.referenceContent}\n`
      : '';

    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    const prompt = `You are a Jira ticket improvement expert. Improve the following ticket to make it exemplary quality.
${templateInstructions}${detailSection}

Current ticket:
${this.formatTicketForPrompt(ticket, options?.linkedTickets)}
${answersSection}${repoSection}${refSection}${skillsSection}

Improve the ticket by:
1. Rewriting the summary to be clear and specific
2. Rewriting the description with proper structure, context, and detail using standard Markdown (headings, bold, bullet/numbered lists, code blocks, tables where useful)
3. Adding or improving acceptance criteria (use Markdown task lists with "- [ ]" syntax)
4. Suggesting appropriate labels
5. Suggesting story points if not set
6. If helpful, generate supporting documents (technical specs, test plans, etc.)
7. If helpful, generate Mermaid diagrams (flowcharts, sequence diagrams, architecture)

IMPORTANT: All text fields (description, acceptanceCriteria, doc content) MUST use clean, standard Markdown formatting. Use headings (##), bold (**text**), bullet lists (- item), numbered lists (1. item), code blocks (with triple backticks), and tables where appropriate. Do NOT use HTML tags.

Return JSON:
{
  "improvedTicket": {
    "summary": "<improved summary>",
    "description": "<improved description in standard Markdown>",
    "acceptanceCriteria": "<acceptance criteria using Markdown task lists>",
    "labels": ["<suggested labels>"],
    "storyPoints": <suggested points or null>
  },
  "generatedDocs": [
    { "title": "<doc title>", "content": "<markdown content>", "format": "markdown" }
  ],
  "mermaidDiagrams": [
    { "title": "<diagram title>", "syntax": "<valid mermaid syntax>" }
  ]
}`;

    const sm = options?.skillsMarkdown?.trim();
    const text = await this.generateContent(
      prompt,
      true,
      'improveTicket',
      { skillsProvided: Boolean(sm), skillsLength: sm?.length ?? 0 },
    );
    return this.parseJson(text);
  }

  async composeTicket(
    freeText: string,
    options?: {
      issueType?: string;
      templateType?: TicketTemplateType;
      repoContextPrompt?: string;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<{
    improvedTicket: TicketChanges;
    generatedDocs: GeneratedDocument[];
    mermaidDiagrams: MermaidDiagram[];
  }> {
    let templateInstructions = '';
    if (options?.templateType) {
      templateInstructions = `\nThe ticket should follow the "${options.templateType}" template structure.
- bug: Include reproduction steps, expected vs actual behavior, environment info, severity.
- feature: Include user story, acceptance criteria, scope, out of scope, technical notes.
- spike: Include research questions, timebox, expected output, decision criteria.
- tech-debt: Include current state, desired state, impact, migration plan, risks.`;
    }

    const issueTypeHint = options?.issueType
      ? `\nThe target issue type is "${options.issueType}". Tailor the structure and detail level accordingly.`
      : '';

    const repoSection = options?.repoContextPrompt
      ? `\n\nProject context (reference real modules, services, and patterns from this codebase):\n${options.repoContextPrompt}\n`
      : '';

    const refSection = options?.referenceContent
      ? `\n\nAdditional reference documents:\n${options.referenceContent}\n`
      : '';

    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    const prompt = `You are a Jira ticket authoring expert. Create a well-structured, high-quality Jira ticket from the following rough description provided by the user.
${templateInstructions}${issueTypeHint}${detailSection}

User's description:
${freeText}
${repoSection}${refSection}${skillsSection}

Create the ticket by:
1. Writing a clear, specific, actionable summary
2. Writing a thorough description with proper structure, context, and detail using standard Markdown (headings, bold, bullet/numbered lists, code blocks, tables where useful)
3. Writing specific, testable acceptance criteria (use Markdown task lists with "- [ ]" syntax)
4. Suggesting appropriate labels
5. Estimating story points based on apparent complexity
6. If helpful, generate supporting documents (technical specs, test plans, etc.)
7. If helpful, generate Mermaid diagrams (flowcharts, sequence diagrams, architecture)

IMPORTANT: All text fields MUST use clean, standard Markdown formatting. Do NOT use HTML tags.

Return JSON:
{
  "improvedTicket": {
    "summary": "<ticket summary>",
    "description": "<full description in standard Markdown>",
    "acceptanceCriteria": "<acceptance criteria using Markdown task lists>",
    "labels": ["<suggested labels>"],
    "storyPoints": <estimated points or null>
  },
  "generatedDocs": [
    { "title": "<doc title>", "content": "<markdown content>", "format": "markdown" }
  ],
  "mermaidDiagrams": [
    { "title": "<diagram title>", "syntax": "<valid mermaid syntax>" }
  ]
}`;

    const text = await this.generateContent(prompt, true, 'composeTicket');
    return this.parseJson(text);
  }

  async breakdownTicket(
    ticket: TicketChanges,
    options?: {
      issueType?: string;
      subtaskType?: string;
      maxTasks?: number;
      repoContextPrompt?: string;
      referenceContent?: string;
      skillsMarkdown?: string;
      detailLevel?: DetailLevel;
    },
  ): Promise<{
    tasks: SubtaskProposal[];
    rationale: string;
  }> {
    const maxTasks = options?.maxTasks ?? 8;
    const subtaskType = options?.subtaskType || 'Sub-task';

    const repoSection = options?.repoContextPrompt
      ? `\n\nProject context (reference real modules and files when suggesting tasks):\n${options.repoContextPrompt}\n`
      : '';

    const refSection = options?.referenceContent
      ? `\n\nReference documents:\n${options.referenceContent}\n`
      : '';

    const skillsSection = skillsMarkdownPromptSection(options?.skillsMarkdown);
    const detailSection = detailLevelPromptSection(options?.detailLevel);

    const prompt = `You are a senior engineering lead. Break down the following Jira ticket into implementable ${subtaskType} tasks.
${detailSection}

Parent ticket:
Summary: ${ticket.summary || '(no summary)'}
Description: ${ticket.description || '(no description)'}
Acceptance Criteria: ${ticket.acceptanceCriteria || '(none)'}
Labels: ${ticket.labels?.join(', ') || '(none)'}
Story Points: ${ticket.storyPoints ?? '(not set)'}
Parent Issue Type: ${options?.issueType || 'Story'}
${repoSection}${refSection}${skillsSection}

Break this ticket into ${maxTasks} or fewer sub-tasks. Each task must:
1. Be independently implementable and testable
2. Have a clear, specific summary
3. Have its own description with context and implementation guidance
4. Have specific, testable acceptance criteria (use "- [ ]" syntax)
5. Include appropriate labels
6. Have a story point estimate (Fibonacci: 1, 2, 3, 5, 8)
7. Be ordered logically (dependencies first)

The sum of sub-task story points should approximately equal the parent's estimate (${ticket.storyPoints ?? 'use your judgment'}).

Return JSON:
{
  "tasks": [
    {
      "id": "<unique_id like task-1>",
      "summary": "<task summary>",
      "description": "<task description in Markdown>",
      "acceptanceCriteria": "<acceptance criteria with - [ ] checkboxes>",
      "labels": ["<labels>"],
      "storyPoints": <number or null>,
      "order": <1-based execution order>
    }
  ],
  "rationale": "<2-3 sentences explaining the decomposition strategy and ordering>"
}`;

    const text = await this.generateContent(prompt, true, 'breakdownTicket');
    return this.parseJson(text);
  }

  async generateGuidingQuestions(
    ticket: Ticket,
    weakDimensions: string[],
    repoContextPrompt?: string,
    referenceContent?: string,
  ): Promise<GuidingQuestion[]> {
    const repoSection = repoContextPrompt ? `\n\nProject context (tailor questions to this specific codebase):\n${repoContextPrompt}\n` : '';
    const refSection = referenceContent ? `\n\nReference documents (tailor questions considering this context):\n${referenceContent}\n` : '';
    const prompt = `You are a Jira ticket quality coach. The following ticket scored poorly on specific dimensions. Generate targeted questions that will help the user provide the missing information.

Ticket:
${this.formatTicketForPrompt(ticket)}${repoSection}${refSection}

Weak dimensions (scored below 7/10): ${weakDimensions.join(', ')}

For each weak dimension, generate 2-4 specific questions that:
- Are specific to THIS ticket's domain and context
- Include example answers in parentheses as hints
- Help fill a concrete gap in the ticket
- Map to a specific field that the answer should enrich

Return JSON:
{
  "questions": [
    {
      "id": "<unique_id>",
      "dimension": "<dimension_id>",
      "question": "<the question>",
      "hints": "<example answers or hints>",
      "targetField": "<description|acceptanceCriteria|labels|storyPoints>"
    }
  ]
}`;

    const text = await this.generateContent(prompt, true, 'generateQuestions');
    const result = this.parseJson<{ questions: GuidingQuestion[] }>(text);
    return result.questions;
  }

  async annotateChanges(original: Ticket, improved: TicketChanges): Promise<Annotation[]> {
    const prompt = `You are explaining changes made to a Jira ticket. Compare the original and improved versions, and for each significant change, explain WHY the change was made.

Original ticket:
${this.formatTicketForPrompt(original)}

Improved version:
Summary: ${improved.summary || original.summary}
Description: ${improved.description || original.description}
Acceptance Criteria: ${improved.acceptanceCriteria || original.acceptanceCriteria || '(none)'}
Labels: ${improved.labels?.join(', ') || original.labels.join(', ')}
Story Points: ${improved.storyPoints ?? original.storyPoints ?? '(not set)'}

For each change, explain the reasoning. Be concise but informative.

Return JSON:
{
  "annotations": [
    {
      "field": "<field name>",
      "reason": "<why this change was made>",
      "originalSnippet": "<relevant part of original>",
      "improvedSnippet": "<relevant part of improved>"
    }
  ]
}`;

    const text = await this.generateContent(prompt, true, 'annotateChanges');
    const result = this.parseJson<{ annotations: Annotation[] }>(text);
    return result.annotations;
  }

  async refineTicket(
    ticket: Ticket,
    currentImprovements: TicketChanges,
    instruction: string,
    conversationHistory: RefinementMessage[],
    repoContextPrompt?: string,
    referenceContent?: string,
    skillsMarkdown?: string,
  ): Promise<RefineResponse> {
    const historySection = conversationHistory.length > 0
      ? '\n\nConversation so far:\n' + conversationHistory.map((m) =>
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n')
      : '';

    const repoSection = repoContextPrompt
      ? `\n\nProject context:\n${repoContextPrompt}\n`
      : '';

    const refSection = referenceContent
      ? `\n\nReference documents:\n${referenceContent}\n`
      : '';

    const skillsSection = skillsMarkdownPromptSection(skillsMarkdown);

    const prompt = `You are a Jira ticket refinement assistant. The user is iteratively improving a ticket through conversation. Apply their instruction to the current ticket state.

Original ticket:
${this.formatTicketForPrompt(ticket)}

Current improved version:
Summary: ${currentImprovements.summary || ticket.summary}
Description: ${currentImprovements.description || ticket.description || '(empty)'}
Acceptance Criteria: ${currentImprovements.acceptanceCriteria || ticket.acceptanceCriteria || '(none)'}
Labels: ${currentImprovements.labels?.join(', ') || ticket.labels.join(', ')}
Story Points: ${currentImprovements.storyPoints ?? ticket.storyPoints ?? '(not set)'}
${historySection}${repoSection}${refSection}${skillsSection}

User instruction: "${instruction}"

Apply the user's instruction to the current improved version. Only change the fields relevant to the instruction — keep everything else as-is.

Use clean, standard Markdown for all text fields.

Return JSON:
{
  "updatedTicket": {
    "summary": "<updated summary>",
    "description": "<updated description in Markdown>",
    "acceptanceCriteria": "<updated acceptance criteria>",
    "labels": ["<labels>"],
    "storyPoints": <points or null>
  },
  "explanation": "<1-2 sentence explanation of what you changed and why>"
}`;

    const text = await this.generateContent(prompt, true, 'refineTicket');
    return this.parseJson<RefineResponse>(text);
  }

  async explainRepoUsage(
    improvedTicket: TicketChanges,
    repoContextPrompt: string,
  ): Promise<RepoUsageSummary> {
    const prompt = `You are analyzing how repository context influenced a Jira ticket improvement. Compare the improved ticket content against the repository information and identify specific connections.

Improved ticket:
Summary: ${improvedTicket.summary || '(unchanged)'}
Description: ${improvedTicket.description || '(unchanged)'}
Acceptance Criteria: ${improvedTicket.acceptanceCriteria || '(none)'}
Labels: ${improvedTicket.labels?.join(', ') || '(none)'}

Repository context:
${repoContextPrompt}

Analyze and return JSON:
{
  "relevance": "<high|medium|low> - how relevant the repo was to the ticket improvements",
  "summary": "<1-2 sentence summary of how the repo context shaped the improvements>",
  "references": [
    { "file": "<file or module path from the repo>", "reason": "<why this file/module was relevant to the ticket>" }
  ],
  "patterns": ["<architectural or design patterns from the repo that influenced the ticket>"],
  "techStack": ["<specific technologies, frameworks, or libraries from the repo reflected in the ticket>"]
}

Rules:
- Only include references to files/modules that actually appear in the repo context
- Be specific — don't list generic patterns unless they come from the actual codebase
- If the repo had low relevance, say so honestly with few or no references
- Keep references to 5-8 most relevant entries max`;

    const text = await this.generateContent(prompt, true, 'explainRepoUsage');
    return this.parseJson<RepoUsageSummary>(text);
  }

  async generateDocument(ticket: Ticket, docType: string): Promise<GeneratedDocument> {
    const prompt = `Generate a ${docType} document for the following Jira ticket. The document should be professional, thorough, and immediately useful.

Ticket:
${this.formatTicketForPrompt(ticket)}

Generate a comprehensive ${docType} in Markdown format.

Return JSON:
{
  "title": "<document title>",
  "content": "<full markdown content>",
  "format": "markdown"
}`;

    const text = await this.generateContent(prompt, true, 'generateDocument');
    return this.parseJson<GeneratedDocument>(text);
  }
}
