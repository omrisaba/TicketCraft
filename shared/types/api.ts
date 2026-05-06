import type { TicketScore } from './score.js';
import type { Ticket, TicketChanges } from './ticket.js';
import type { TicketTemplate, TicketTemplateType } from './template.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
}

export interface ScoreRequest {
  ticket: Ticket;
  linkedTickets?: Ticket[];
}

export interface ImproveRequest {
  ticket: Ticket;
  templateType?: TicketTemplateType;
  userAnswers?: Record<string, string>;
  linkedTickets?: Ticket[];
  /**
   * Session-only Markdown: user-defined ticket-writing rules. Inlined into improve prompts only;
   * not persisted in drafts/history.
   */
  skillsMarkdown?: string;
  /** Repo-derived context passed from the client; server may merge MCP output. */
  repoContextPrompt?: string;
  referenceContent?: string;
  repoUrl?: string;
  useCursor?: boolean;
}

export interface ImproveResponse {
  improvedTicket: TicketChanges;
  generatedDocs: GeneratedDocument[];
  mermaidDiagrams: MermaidDiagram[];
}

export interface GuidingQuestionsRequest {
  ticket: Ticket;
  weakDimensions: string[];
}

export interface GuidingQuestion {
  id: string;
  dimension: string;
  question: string;
  hints: string;
  targetField: string;
}

export interface GuidingQuestionsResponse {
  questions: GuidingQuestion[];
}

export interface AnnotateRequest {
  original: Ticket;
  improved: TicketChanges;
}

export interface Annotation {
  field: string;
  reason: string;
  originalSnippet: string;
  improvedSnippet: string;
}

export interface AnnotateResponse {
  annotations: Annotation[];
}

export interface GeneratedDocument {
  title: string;
  content: string;
  format: 'markdown';
}

export interface MermaidDiagram {
  title: string;
  syntax: string;
}

export interface ExportRequest {
  ticket: Ticket;
  improvements?: TicketChanges;
  score?: TicketScore;
  format: 'pdf' | 'markdown';
}

export interface SyncRequest {
  ticketKey: string;
  changes: TicketChanges;
  attachments?: { filename: string; content: string; mimeType: string }[];
}

export interface HistoryEntry {
  ticketKey: string;
  ticketSummary: string;
  scoreBefore: number;
  scoreAfter: number | null;
  syncedAt: string | null;
  timestamp: string;
}

export interface RefinementMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  appliedChanges?: Partial<TicketChanges>;
}

export interface RefineRequest {
  ticket: Ticket;
  currentImprovements: TicketChanges;
  instruction: string;
  conversationHistory: RefinementMessage[];
  repoContextPrompt?: string;
}

export interface RefineResponse {
  updatedTicket: TicketChanges;
  explanation: string;
}

export interface ReferenceLink {
  url: string;
  label: string;
  content?: string;
  error?: string;
  fetched: boolean;
}

export interface RepoReference {
  file: string;
  reason: string;
}

export interface RepoUsageSummary {
  relevance: 'high' | 'medium' | 'low';
  summary: string;
  references: RepoReference[];
  patterns: string[];
  techStack: string[];
}
