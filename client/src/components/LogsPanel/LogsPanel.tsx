import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';
import { Button } from '../ui/Button';
import {
  X,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react';

type LogCategory = 'llm' | 'mcp';

interface LogEntry {
  id: string;
  category: LogCategory;
  timestamp: string;
  operation: string;
  model?: string;
  temperature?: number;
  provider?: string;
  tool?: string;
  promptLength?: number;
  responseLength?: number;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

interface LogDaySummary {
  date: string;
  total: number;
  llm: number;
  mcp: number;
}

interface LogStats {
  total: number;
  llm: number;
  mcp: number;
  llmErrors: number;
  mcpErrors: number;
  byDate?: LogDaySummary[];
}

interface Props {
  onClose: () => void;
}

export function LogsPanel({ onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | LogCategory>('all');
  const [dayFilter, setDayFilter] = useState<string | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await api.admin.logs({
        category: filter === 'all' ? undefined : filter,
        date: dayFilter || undefined,
        limit: 10_000,
      }) as {
        entries: LogEntry[];
        stats: LogStats;
        retentionDays?: number;
      };
      setEntries(result.entries);
      setStats(result.stats);
      if (typeof result.retentionDays === 'number') setRetentionDays(result.retentionDays);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter, dayFilter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleClear = async () => {
    try {
      await api.admin.clearLogs();
      setEntries([]);
      setStats({ total: 0, llm: 0, mcp: 0, llmErrors: 0, mcpErrors: 0 });
    } catch { /* ignore */ }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatSize = (chars: number | undefined) => {
    if (chars == null) return '—';
    if (chars < 1000) return `${chars} chars`;
    return `${(chars / 1000).toFixed(1)}k chars`;
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDayLabel = (utcDate: string) => {
    const d = new Date(`${utcDate}T12:00:00Z`);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">System Logs</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              NDJSON on disk · last {retentionDays} days (UTC) · auto-pruned
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="flex items-center gap-3 text-xs text-gray-500 mr-2">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-purple-500" />
                  LLM: {stats.llm}{stats.llmErrors > 0 && <span className="text-red-500">({stats.llmErrors} err)</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-blue-500" />
                  MCP: {stats.mcp}{stats.mcpErrors > 0 && <span className="text-red-500">({stats.mcpErrors} err)</span>}
                </span>
              </div>
            )}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                autoRefresh
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
              aria-pressed={autoRefresh}
            >
              {autoRefresh ? 'Live' : 'Auto'}
            </button>
            <Button variant="ghost" size="sm" onClick={fetchLogs} aria-label="Refresh logs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} aria-label="Clear logs">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close logs panel">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <Filter className="w-3.5 h-3.5 text-gray-400 mr-1" />
          {(['all', 'llm', 'mcp'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                filter === f
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
        </div>

        {stats?.byDate && stats.byDate.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-3 pb-2 border-b border-gray-100">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide mr-1">Day (UTC)</span>
            <button
              type="button"
              onClick={() => setDayFilter('')}
              className={`text-xs px-2 py-0.5 rounded border ${
                dayFilter === ''
                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                  : 'border-transparent text-gray-500 hover:bg-gray-50'
              }`}
            >
              All days
            </button>
            {stats.byDate.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => setDayFilter(dayFilter === d.date ? '' : d.date)}
                className={`text-xs px-2 py-0.5 rounded border ${
                  dayFilter === d.date
                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                    : 'border-transparent text-gray-500 hover:bg-gray-50'
                }`}
                title={`${d.llm} LLM · ${d.mcp} MCP`}
              >
                {d.date}{' '}
                <span className="text-gray-400">({d.total})</span>
              </button>
            ))}
          </div>
        )}

        {/* Log entries — grouped by UTC date */}
        <div className="max-h-[400px] overflow-y-auto space-y-1">
          {entries.length === 0 && !loading && (
            <div className="text-center text-gray-400 py-8 text-sm">
              No log entries yet. Logs will appear as you use AI and MCP features.
            </div>
          )}

          {(() => {
            let lastDay = '';
            return entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const isLLM = entry.category === 'llm';
            const dayKey = entry.timestamp.slice(0, 10);
            const showDayHeader = dayKey !== lastDay;
            if (showDayHeader) lastDay = dayKey;

            return (
              <div key={entry.id}>
                {showDayHeader && (
                  <div className="sticky top-0 z-[1] bg-gray-100/95 backdrop-blur-sm text-[11px] font-semibold text-gray-600 px-2 py-1 mt-2 first:mt-0 rounded">
                    {formatDayLabel(dayKey)}{' '}
                    <span className="font-normal text-gray-400">({dayKey} UTC)</span>
                  </div>
                )}
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                  }

                  {/* Category icon */}
                  {isLLM
                    ? <Cpu className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    : <Wrench className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  }

                  {/* Operation */}
                  <span className="text-xs font-medium text-gray-800 truncate">
                    {entry.operation}
                    {entry.tool && <span className="text-blue-600 ml-1">→ {entry.tool}</span>}
                  </span>

                  {/* Model / provider */}
                  {entry.model && (
                    <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded shrink-0">
                      {entry.model.replace(/^gemini-/, '')}
                    </span>
                  )}
                  {entry.provider && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
                      {entry.provider}
                    </span>
                  )}

                  {/* Status */}
                  {entry.success
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  }

                  {/* Duration */}
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400 shrink-0 ml-auto">
                    <Clock className="w-3 h-3" />
                    {formatDuration(entry.durationMs)}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {entry.model && (
                        <div>
                          <span className="text-gray-400">Model:</span>{' '}
                          <span className="text-gray-700 font-medium">{entry.model}</span>
                        </div>
                      )}
                      {entry.temperature != null && (
                        <div>
                          <span className="text-gray-400">Temperature:</span>{' '}
                          <span className="text-gray-700">{entry.temperature}</span>
                        </div>
                      )}
                      {entry.promptLength != null && (
                        <div>
                          <span className="text-gray-400">Prompt:</span>{' '}
                          <span className="text-gray-700">{formatSize(entry.promptLength)}</span>
                        </div>
                      )}
                      {entry.responseLength != null && (
                        <div>
                          <span className="text-gray-400">Response:</span>{' '}
                          <span className="text-gray-700">{formatSize(entry.responseLength)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">Duration:</span>{' '}
                        <span className="text-gray-700">{formatDuration(entry.durationMs)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Status:</span>{' '}
                        <span className={entry.success ? 'text-green-600' : 'text-red-600'}>
                          {entry.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                    </div>

                    {entry.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700 font-mono break-all">
                        {entry.error}
                      </div>
                    )}

                    {entry.meta && Object.keys(entry.meta).length > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Details</span>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-[11px] text-gray-700 overflow-x-auto max-h-48 font-mono">
                          {JSON.stringify(entry.meta, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            );
          });
          })()}
        </div>
      </div>
    </div>
  );
}
