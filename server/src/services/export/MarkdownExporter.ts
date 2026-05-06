import type { Ticket, TicketChanges, TicketScore } from 'ticketcraft-shared';
import { getScoreBadge } from 'ticketcraft-shared';
import type { ExportService } from '../interfaces/ExportService.js';

export class MarkdownExporter implements Partial<ExportService> {
  async exportAsMarkdown(
    ticket: Ticket,
    improvements?: TicketChanges,
    score?: TicketScore,
  ): Promise<string> {
    const lines: string[] = [];

    lines.push(`# ${improvements?.summary || ticket.summary}`);
    lines.push(`**Ticket:** ${ticket.key}`);
    lines.push(`**Type:** ${ticket.issueType}`);
    lines.push(`**Status:** ${ticket.status}`);
    lines.push(`**Priority:** ${ticket.priority || 'Not set'}`);

    if (score) {
      const badge = getScoreBadge(score.overall);
      lines.push('');
      lines.push(`## Quality Score: ${score.overall}/100 (${badge})`);
      lines.push('');
      lines.push('| Dimension | Score | Feedback |');
      lines.push('|-----------|-------|----------|');
      for (const dim of score.dimensions) {
        lines.push(`| ${dim.name} | ${dim.score}/${dim.maxScore} | ${dim.feedback} |`);
      }
    }

    lines.push('');
    lines.push('## Description');
    lines.push('');
    lines.push(improvements?.description || ticket.description || '*No description*');

    if (improvements?.acceptanceCriteria || ticket.acceptanceCriteria) {
      lines.push('');
      lines.push('## Acceptance Criteria');
      lines.push('');
      lines.push(improvements?.acceptanceCriteria || ticket.acceptanceCriteria!);
    }

    const labels = improvements?.labels || ticket.labels;
    if (labels.length > 0) {
      lines.push('');
      lines.push(`**Labels:** ${labels.join(', ')}`);
    }

    const points = improvements?.storyPoints ?? ticket.storyPoints;
    if (points !== null && points !== undefined) {
      lines.push(`**Story Points:** ${points}`);
    }

    if (ticket.comments.length > 0) {
      lines.push('');
      lines.push('## Comments');
      lines.push('');
      for (const comment of ticket.comments) {
        lines.push(`**${comment.author}** (${new Date(comment.created).toLocaleDateString()}):`);
        lines.push(comment.body);
        lines.push('');
      }
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Exported by TicketCraft on ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  async exportAsPdf(): Promise<Buffer> {
    throw new Error('PDF export not yet implemented. Use markdown export.');
  }
}
