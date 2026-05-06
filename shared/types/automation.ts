import type { Ticket, TicketChanges } from './ticket.js';
import type { TicketScore } from './score.js';
import type { Annotation } from './api.js';

export interface AutomationResult {
  ticketKey: string;
  reporterEmail: string;
  reporterName: string;
  ticket: Ticket;
  score: TicketScore;
  improvements: TicketChanges;
  annotations: Annotation[];
  processedAt: string;
}

export interface AutomationPendingItem {
  ticketKey: string;
  summary: string;
  issueType: string;
  reporterName: string;
  overallScore: number;
  processedAt: string;
}

export interface AutomationScanResult {
  found: number;
  processed: number;
  skipped: number;
}

export interface AutomationInfo {
  triggerLabel: string;
  doneLabel: string;
  baseClauses: readonly string[];
}
