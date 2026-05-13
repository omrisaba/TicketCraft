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

export type DetailLevel = 'high' | 'medium' | 'low';

export const DETAIL_LEVEL_META: Record<DetailLevel, { label: string; description: string }> = {
  high: { label: 'Strategic (HLD)', description: 'Goals, scope, architecture. No code references.' },
  medium: { label: 'Balanced', description: 'Technical approach with module-level references.' },
  low: { label: 'Implementation (LLD)', description: 'Specific files, functions, code paths.' },
};

const ISSUE_TYPE_DETAIL_MAP: Record<string, DetailLevel> = {
  Epic: 'high',
  Initiative: 'high',
  Story: 'medium',
  Feature: 'medium',
  Task: 'medium',
  'Sub-task': 'low',
  Subtask: 'low',
  Bug: 'low',
  'Tech Debt': 'low',
  Spike: 'medium',
};

export function suggestedDetailLevel(issueType: string): DetailLevel {
  return ISSUE_TYPE_DETAIL_MAP[issueType] ?? 'medium';
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
  /** Controls the depth of technical detail in the AI output. */
  detailLevel?: DetailLevel;
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
  type?: 'improved' | 'created';
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
  referenceContent?: string;
  skillsMarkdown?: string;
  repoUrl?: string;
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

// ── Compose from Scratch ────────────────────────────────────

export interface ComposeRequest {
  freeText: string;
  projectKey: string;
  issueType: string;
  templateType?: TicketTemplateType;
  detailLevel?: DetailLevel;
  skillsMarkdown?: string;
  repoContextPrompt?: string;
  referenceContent?: string;
  repoUrl?: string;
  useCursor?: boolean;
}

export interface SubtaskProposal {
  id: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  labels: string[];
  storyPoints: number | null;
  order: number;
}

export interface BreakdownRequest {
  ticket: TicketChanges;
  projectKey: string;
  issueType: string;
  subtaskType?: string;
  maxTasks?: number;
  repoContextPrompt?: string;
  referenceContent?: string;
  repoUrl?: string;
  useCursor?: boolean;
  skillsMarkdown?: string;
  detailLevel?: DetailLevel;
}

export interface BreakdownResponse {
  tasks: SubtaskProposal[];
  rationale: string;
}

export interface BatchCreateRequest {
  parentTicket: {
    projectKey: string;
    issueType: string;
    changes: TicketChanges;
    assigneeAccountId?: string;
  };
  subtasks: {
    issueType: string;
    changes: TicketChanges;
  }[];
}

export interface BatchCreateResponse {
  parent: { key: string; id: string };
  subtasks: { key: string; id: string; summary: string }[];
  errors: { index: number; summary: string; error: string }[];
}

export interface JiraProject {
  key: string;
  name: string;
  avatarUrl: string | null;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}
