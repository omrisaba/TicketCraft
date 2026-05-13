export interface TicketRef {
  key: string;
  summary: string;
  status: string;
  issueType: string;
}

export interface Ticket {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  reporterEmail: string | null;
  labels: string[];
  storyPoints: number | null;
  issueType: string;
  acceptanceCriteria: string | null;
  parent: TicketRef | null;
  subtasks: TicketRef[];
  linkedTickets: LinkedTicket[];
  attachments: Attachment[];
  comments: Comment[];
  created: string;
  updated: string;
  rawAdf: unknown | null;
}

export interface LinkedTicket {
  key: string;
  summary: string;
  status: string;
  linkType: string;
  direction: 'inward' | 'outward';
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  created: string;
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

export interface TicketChanges {
  summary?: string;
  description?: string;
  acceptanceCriteria?: string;
  labels?: string[];
  storyPoints?: number;
}
