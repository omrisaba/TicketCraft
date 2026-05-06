import { useState } from 'react';
import { Button } from '../ui/Button';
import { api } from '../../services/apiClient';
import type { Ticket, TicketChanges, TicketScore } from 'ticketcraft-shared';
import { FileText } from 'lucide-react';

interface ExportPanelProps {
  ticket: Ticket;
  improvements?: TicketChanges;
  score?: TicketScore;
}

export function ExportPanel({ ticket, improvements, score }: ExportPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: 'markdown') => {
    setLoading(format);
    setError(null);
    try {
      const content = await api.export.markdown({ ticket, improvements, score }) as string;

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ticket.key}-improved.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        icon={<FileText className="w-4 h-4" />}
        loading={loading === 'markdown'}
        onClick={() => handleExport('markdown')}
      >
        Export Markdown
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
