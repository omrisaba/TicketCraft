import type { Ticket, TicketChanges } from './ticket.js';
import type { TicketScore } from './score.js';
import type { GuidingQuestion, Annotation, HistoryEntry, ReferenceLink } from './api.js';
import type { TicketTemplateType } from './template.js';

export interface DraftData {
  ticketKey: string;
  ticket: Ticket | null;
  improvements: TicketChanges | null;
  score: TicketScore | null;
  previousScore: TicketScore | null;
  questions: GuidingQuestion[];
  annotations: Annotation[];
  userAnswers: Record<string, string>;
  selectedTemplate: TicketTemplateType | null;
  repoUrl: string | null;
  referenceLinks: ReferenceLink[];
  step: 'fetch' | 'scored' | 'improving' | 'review';
  history: HistoryEntry[];
  savedAt: string;
}

export interface DraftMetadata {
  ticketKey: string;
  ticketSummary: string;
  step: string;
  savedAt: string;
}
