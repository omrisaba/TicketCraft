import type { Ticket, TicketChanges } from './ticket.js';
import type { TicketScore } from './score.js';
import type { Annotation, ReferenceLink, RepoUsageSummary } from './api.js';
import type { McpUsageStats } from './mcp.js';

export interface HistorySnapshot {
  id: string;
  ticketKey: string;
  ticketSummary: string;
  ticket: Ticket;
  score: TicketScore;
  improvements: TicketChanges;
  annotations: Annotation[];
  repoUsage: RepoUsageSummary | null;
  mcpStats: McpUsageStats | null;
  referenceLinks: ReferenceLink[];
  repoUrl: string | null;
  codeInsights: string | null;
  syncedAt: string | null;
  savedAt: string;
}

export interface HistoryListItem {
  id: string;
  ticketKey: string;
  ticketSummary: string;
  overallScore: number;
  syncedAt: string | null;
  savedAt: string;
}
