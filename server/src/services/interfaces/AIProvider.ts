import type {
  Ticket,
  TicketScore,
  TicketChanges,
  GuidingQuestion,
  Annotation,
  GeneratedDocument,
  MermaidDiagram,
  TicketTemplateType,
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
      /** Session-only Markdown; inlined into prompt only */
      skillsMarkdown?: string;
    },
  ): Promise<{
    improvedTicket: TicketChanges;
    generatedDocs: GeneratedDocument[];
    mermaidDiagrams: MermaidDiagram[];
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
