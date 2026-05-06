import type { Ticket, TicketChanges, LinkedTicket } from 'ticketcraft-shared';

export interface UserInfo {
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
}

export interface IssueTracker {
  getTicket(ticketKey: string): Promise<Ticket>;

  updateTicket(ticketKey: string, changes: TicketChanges): Promise<void>;

  uploadAttachment(
    ticketKey: string,
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<void>;

  getLinkedTickets(ticketKey: string): Promise<LinkedTicket[]>;

  validateCredentials(): Promise<UserInfo>;
}
