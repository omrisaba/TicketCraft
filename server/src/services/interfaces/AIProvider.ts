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
  SubtaskProposal,
} from 'ticketcraft-shared';

export interface AIProvider {
  scoreTicket(ticket: Ticket, linkedTickets?: Ticket[], repoContextPrompt?: string, referenceContent?: string): Promise<TicketScore>;

  improveTicket(
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
  }>;

  composeTicket(
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
  }>;

  breakdownTicket(
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
  }>;

  generateGuidingQuestions(
    ticket: Ticket,
    weakDimensions: string[],
    repoContextPrompt?: string,
    referenceContent?: string,
  ): Promise<GuidingQuestion[]>;

  annotateChanges(
    original: Ticket,
    improved: TicketChanges,
  ): Promise<Annotation[]>;

  generateDocument(
    ticket: Ticket,
    docType: string,
  ): Promise<GeneratedDocument>;

  validateApiKey(): Promise<boolean>;
}
