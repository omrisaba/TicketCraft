import { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { getScoreBadge } from 'ticketcraft-shared';
import type { HistoryListItem } from 'ticketcraft-shared';
import { Clock, Eye, Trash2, RefreshCw } from 'lucide-react';

interface Props {
  onSelectSnapshot: (id: string) => void;
  refreshKey: number;
}

export function SessionHistory({ onSelectSnapshot, refreshKey }: Props) {
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const list = await api.history.list() as HistoryListItem[];
      setItems(list);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.history.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-6 justify-center text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading history...</span>
        </div>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <div className="text-center text-gray-400 py-8">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No tickets improved yet.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Session History</h3>
      <div className="divide-y divide-gray-100">
        {items.map((item) => {
          const badge = getScoreBadge(item.overallScore);
          return (
            <button
              key={item.id}
              onClick={() => onSelectSnapshot(item.id)}
              className="w-full py-3 px-2 flex items-center justify-between hover:bg-gray-50 rounded-lg transition-colors text-left group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                  {item.ticketKey}: {item.ticketSummary}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(item.savedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant={
                  badge === 'exemplary' ? 'success' :
                  badge === 'good' ? 'info' :
                  badge === 'needs-work' ? 'warning' : 'danger'
                }>
                  {item.overallScore}
                </Badge>
                {item.syncedAt && <Badge variant="success">Synced</Badge>}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-blue-500" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(item.id, e)}
                    aria-label="Delete snapshot"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                  </Button>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
