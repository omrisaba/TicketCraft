import { useEffect, useState } from 'react';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { getScoreBadge } from 'ticketcraft-shared';
import type { HistoryListItem } from 'ticketcraft-shared';
import { Clock, Eye, Trash2, RefreshCw, CheckCircle2, PenLine, ArrowRight, Sparkles } from 'lucide-react';

type HistoryTab = 'in-progress' | 'synced';

interface Props {
  onSelectSnapshot: (id: string) => void;
  refreshKey: number;
}

function scoreBadgeVariant(score: number) {
  const badge = getScoreBadge(score);
  return badge === 'exemplary' ? 'success' as const
    : badge === 'good' ? 'info' as const
    : badge === 'needs-work' ? 'warning' as const
    : 'danger' as const;
}

function HistoryRow({
  item,
  onSelect,
  onDelete,
}: {
  item: HistoryListItem;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const hasEvolution = item.originalScore != null
    && item.originalScore !== item.overallScore;

  return (
    <button
      onClick={onSelect}
      className="w-full py-3 px-2 flex items-center justify-between hover:bg-gray-50 rounded-lg transition-colors text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
          {item.type === 'created'
            ? <Sparkles className="w-3.5 h-3.5 text-green-500 shrink-0" />
            : <PenLine className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          <span className="truncate">{item.ticketKey}: {item.ticketSummary}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
            item.type === 'created'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {item.type === 'created' ? 'Created' : 'Improved'}
          </span>
        </p>
        <p className="text-xs text-gray-400">
          {new Date(item.savedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {hasEvolution ? (
          <span className="flex items-center gap-1">
            <Badge variant={scoreBadgeVariant(item.originalScore!)} size="sm">
              {item.originalScore}
            </Badge>
            <ArrowRight className="w-3 h-3 text-gray-400" />
            <Badge variant={scoreBadgeVariant(item.overallScore)}>
              {item.overallScore}
            </Badge>
          </span>
        ) : (
          <Badge variant={scoreBadgeVariant(item.overallScore)}>
            {item.overallScore}
          </Badge>
        )}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Eye className="w-3.5 h-3.5 text-blue-500" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label="Delete snapshot"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
          </Button>
        </span>
      </div>
    </button>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="text-center text-gray-400 py-6">
      <Clock className="w-6 h-6 mx-auto mb-1.5" />
      <p className="text-sm">No {label} tickets yet.</p>
    </div>
  );
}

export function SessionHistory({ onSelectSnapshot, refreshKey }: Props) {
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HistoryTab>('in-progress');

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
          <p className="text-sm">No tickets processed yet.</p>
        </div>
      </Card>
    );
  }

  const synced = items.filter((i) => i.syncedAt);
  const inProgress = items.filter((i) => !i.syncedAt);
  const visibleItems = activeTab === 'in-progress' ? inProgress : synced;

  return (
    <Card>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button
          onClick={() => setActiveTab('in-progress')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'in-progress'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <PenLine className="w-3.5 h-3.5" />
          In Progress
          {inProgress.length > 0 && (
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${
              activeTab === 'in-progress' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {inProgress.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('synced')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'synced'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Synced
          {synced.length > 0 && (
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${
              activeTab === 'synced' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {synced.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {visibleItems.length === 0 ? (
        <EmptyTab label={activeTab === 'in-progress' ? 'in-progress' : 'synced'} />
      ) : (
        <div className="divide-y divide-gray-100">
          {visibleItems.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              onSelect={() => onSelectSnapshot(item.id)}
              onDelete={(e) => handleDelete(item.id, e)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
