import type { Ticket, TicketChanges, TicketScore } from 'ticketcraft-shared';

export interface ExportService {
  exportAsPdf(
    ticket: Ticket,
    improvements?: TicketChanges,
    score?: TicketScore,
  ): Promise<Buffer>;

  exportAsMarkdown(
    ticket: Ticket,
    improvements?: TicketChanges,
    score?: TicketScore,
  ): Promise<string>;
}
