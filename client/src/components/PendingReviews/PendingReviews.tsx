import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';
import { useSession } from '../../context/SessionContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { AutomationPendingItem } from 'ticketcraft-shared';
import { Bot, ArrowRight, Loader2, Radar, X, Lock, ChevronDown, ChevronUp } from 'lucide-react';

interface PendingReviewsProps {
  onReview: (ticketKey: string) => void;
}

interface ScanResult {
  found: number;
  processed: number;
  skipped: number;
}

const BASE_CLAUSES = [
  'reporter = currentUser()',
  'labels = "readyForTicketCraftRefinement"',
] as const;

function buildFullJql(extraJql: string): string {
  const clauses: string[] = [...BASE_CLAUSES];
  const extra = extraJql.trim();
  if (extra) clauses.push(`(${extra})`);
  return clauses.join(' AND ');
}

export function PendingReviews({ onReview }: PendingReviewsProps) {
  const { jiraUser } = useSession();
  const [items, setItems] = useState<AutomationPendingItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);

  const storageKey = `ticketcraft:extraJql:${jiraUser?.emailAddress ?? ''}`;
  const [extraJql, setExtraJql] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setExtraJql(saved);
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, extraJql);
  }, [extraJql, storageKey]);

  const loadPending = useCallback(async () => {
    try {
      const data = await api.automation.pending() as AutomationPendingItem[];
      setItems(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadPending().finally(() => setLoadingQueue(false));
  }, [loadPending]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResult(null);
    try {
      const result = await api.automation.scan(extraJql.trim() || undefined) as ScanResult;
      setScanResult(result);
      await loadPending();
    } catch (err: any) {
      setError(err.message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (ticketKey: string) => {
    try {
      await api.automation.dismiss(ticketKey);
      setItems((prev) => prev.filter((i) => i.ticketKey !== ticketKey));
    } catch { /* silent */ }
  };

  const scoreBadge = (score: number) => {
    if (score >= 70) return 'success' as const;
    if (score >= 50) return 'warning' as const;
    return 'danger' as const;
  };

  const fullJql = buildFullJql(extraJql);

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-900">Ticket Scanner</h3>
            {items.length > 0 && (
              <Badge size="sm" variant="info">{items.length} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Filter
              {showFilter ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <Button
              size="sm"
              variant="secondary"
              icon={scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
              loading={scanning}
              onClick={handleScan}
            >
              {scanning ? 'Scanning...' : 'Scan My Tickets'}
            </Button>
          </div>
        </div>

        {showFilter && (
          <div className="space-y-2.5 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex flex-wrap gap-1.5">
              {BASE_CLAUSES.map((clause) => (
                <span
                  key={clause}
                  className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-gray-200 text-gray-600 rounded-md px-2 py-1"
                >
                  <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                  {clause}
                </span>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Additional filters (optional)</label>
              <textarea
                value={extraJql}
                onChange={(e) => setExtraJql(e.target.value)}
                rows={2}
                className="w-full text-xs font-mono border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y placeholder:text-gray-400"
                placeholder='e.g. project = GENIE AND status = "Refinement"'
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium text-gray-500">Full JQL preview</span>
              <pre className="text-[11px] font-mono bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-600 whitespace-pre-wrap break-all select-all">
                {fullJql}
              </pre>
            </div>
          </div>
        )}

        {!showFilter && (
          <p className="text-xs text-gray-500">
            Scan Jira for your tickets labeled <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px] font-mono">readyForTicketCraftRefinement</code>.
            Each ticket will be automatically scored and improved by AI.
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600">{error}</p>
        )}

        {scanResult && !scanning && (
          <div className="text-xs bg-purple-50 border border-purple-200 rounded-md px-3 py-2 text-purple-700">
            Found {scanResult.found} ticket{scanResult.found !== 1 ? 's' : ''} —
            {' '}{scanResult.processed} processed, {scanResult.skipped} already in queue.
          </div>
        )}

        {loadingQueue && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading queue...
          </div>
        )}

        {items.length > 0 && (
          <div className="divide-y divide-gray-100 border-t border-gray-100 pt-2">
            <div className="pb-1.5">
              <span className="text-xs font-medium text-gray-600">Waiting for Review</span>
            </div>
            {items.map((item) => (
              <div key={item.ticketKey} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{item.ticketKey}</span>
                    <Badge size="sm">{item.issueType}</Badge>
                    <Badge size="sm" variant={scoreBadge(item.overallScore)}>
                      {Math.round(item.overallScore)}/100
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{item.summary}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Processed {new Date(item.processedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    icon={<ArrowRight className="w-3.5 h-3.5" />}
                    onClick={() => onReview(item.ticketKey)}
                  >
                    Review
                  </Button>
                  <button
                    onClick={() => handleDismiss(item.ticketKey)}
                    aria-label={`Dismiss ${item.ticketKey}`}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
