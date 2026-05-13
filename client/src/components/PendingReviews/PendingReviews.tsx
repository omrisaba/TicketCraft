import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';
import { useSession } from '../../context/SessionContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { AutomationPendingItem, JqlSearchResult, DetailLevel, AutomationInfo } from 'ticketcraft-shared';
import { DETAIL_LEVEL_META } from 'ticketcraft-shared';
import {
  Bot, ArrowRight, Loader2, X, Search,
  Sparkles, Layers, CheckSquare, Square, MinusSquare, FilterX, Info,
} from 'lucide-react';

interface PendingReviewsProps {
  onReview: (ticketKey: string) => void;
}

interface ScanResult {
  found: number;
  processed: number;
  skipped: number;
}

type Phase = 'idle' | 'results' | 'crafting';

export function PendingReviews({ onReview }: PendingReviewsProps) {
  const { jiraUser } = useSession();
  const [items, setItems] = useState<AutomationPendingItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [searching, setSearching] = useState(false);
  const [crafting, setCrafting] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `ticketcraft:jql:${jiraUser?.emailAddress ?? ''}`;
  const [jql, setJql] = useState('');
  const [searchResults, setSearchResults] = useState<JqlSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('medium');
  const [excludeProcessed, setExcludeProcessed] = useState(true);
  const [doneLabel, setDoneLabel] = useState('processedByTicketCraft');
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setJql(saved);
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, jql);
  }, [jql, storageKey]);

  const loadPending = useCallback(async () => {
    try {
      const data = await api.automation.pending() as AutomationPendingItem[];
      setItems(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadPending().finally(() => setLoadingQueue(false));
    api.automation.info()
      .then((info) => setDoneLabel((info as AutomationInfo).doneLabel))
      .catch(() => {});
  }, [loadPending]);

  const handleSearch = async () => {
    if (!jql.trim()) return;
    setSearching(true);
    setError(null);
    setScanResult(null);
    setSearchResults([]);
    setSelected(new Set());
    setPhase('idle');
    try {
      const data = await api.automation.search(jql.trim(), excludeProcessed) as { tickets: JqlSearchResult[] };
      setSearchResults(data.tickets);
      setSelected(new Set(data.tickets.map((t) => t.key)));
      setPhase('results');
    } catch (err: any) {
      setError(err.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleCraft = async () => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    setCrafting(true);
    setError(null);
    setScanResult(null);
    setPhase('crafting');
    try {
      const result = await api.automation.scan(keys, detailLevel) as ScanResult;
      setScanResult(result);
      setSearchResults([]);
      setSelected(new Set());
      setPhase('idle');
      await loadPending();
    } catch (err: any) {
      setError(err.message || 'Processing failed.');
      setPhase('results');
    } finally {
      setCrafting(false);
    }
  };

  const handleDismiss = async (ticketKey: string) => {
    try {
      await api.automation.dismiss(ticketKey);
      setItems((prev) => prev.filter((i) => i.ticketKey !== ticketKey));
    } catch { /* silent */ }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === searchResults.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(searchResults.map((t) => t.key)));
    }
  };

  const scoreBadge = (score: number) => {
    if (score >= 70) return 'success' as const;
    if (score >= 50) return 'warning' as const;
    return 'danger' as const;
  };

  const allSelected = searchResults.length > 0 && selected.size === searchResults.length;
  const someSelected = selected.size > 0 && selected.size < searchResults.length;

  return (
    <Card>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-900">Ticket Scanner</h3>
          {items.length > 0 && (
            <Badge size="sm" variant="info">{items.length} pending</Badge>
          )}
        </div>

        {/* JQL input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">JQL Query</label>
          <textarea
            value={jql}
            onChange={(e) => setJql(e.target.value)}
            rows={2}
            className="w-full text-xs font-mono border border-gray-300 rounded-md px-2.5 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y placeholder:text-gray-400"
            placeholder='e.g. project = GENIE AND status = "Refinement" AND assignee = currentUser()'
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeProcessed}
                onChange={(e) => setExcludeProcessed(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <FilterX className="w-3.5 h-3.5 text-gray-400" />
              Exclude already processed
            </label>
            <Button
              size="sm"
              variant="secondary"
              icon={searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              loading={searching}
              disabled={!jql.trim()}
              onClick={handleSearch}
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
          {jql.trim() && (
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-gray-400">Effective JQL</span>
              <pre className="text-[11px] font-mono bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-400 whitespace-pre-wrap break-all select-all">
                {excludeProcessed
                  ? `(${jql.trim()}) AND (labels IS EMPTY OR labels NOT IN (${doneLabel}))`
                  : jql.trim()}
              </pre>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">{error}</p>
        )}

        {/* Search results with checkboxes */}
        {phase !== 'idle' && searchResults.length > 0 && (
          <div className="space-y-2 border border-gray-200 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
              <button
                type="button"
                onClick={toggleAll}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title={allSelected ? 'Deselect all' : 'Select all'}
              >
                {allSelected
                  ? <CheckSquare className="w-4 h-4 text-blue-600" />
                  : someSelected
                    ? <MinusSquare className="w-4 h-4 text-blue-400" />
                    : <Square className="w-4 h-4" />}
              </button>
              <span className="text-xs font-medium text-gray-600 flex-1">
                {searchResults.length} ticket{searchResults.length !== 1 ? 's' : ''} found
                {searchResults.length === 50 && (
                  <span className="text-gray-400 font-normal"> (showing first 50 — refine your JQL for more specific results)</span>
                )}
                {selected.size > 0 && ` · ${selected.size} selected`}
              </span>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-200 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
              <span className="w-4 shrink-0" />
              <span className="w-24 shrink-0">Key</span>
              <span className="w-16 shrink-0">Type</span>
              <span className="w-20 shrink-0">Status</span>
              <span className="w-24 shrink-0 hidden sm:inline">Assignee</span>
              <span className="flex-1">Summary</span>
            </div>

            {/* Ticket rows */}
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {searchResults.map((t) => (
                <label
                  key={t.key}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    selected.has(t.key) ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSelect(t.key)}
                    className="shrink-0"
                  >
                    {selected.has(t.key)
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : <Square className="w-4 h-4 text-gray-400" />}
                  </button>
                  <span className="w-24 shrink-0 text-sm font-medium text-gray-900">{t.key}</span>
                  <span className="w-16 shrink-0"><Badge size="sm">{t.issueType}</Badge></span>
                  <span className="w-20 shrink-0"><Badge size="sm" variant="default">{t.status}</Badge></span>
                  <span className="w-24 shrink-0 text-[11px] text-gray-400 hidden sm:inline truncate">
                    {t.assignee || '—'}
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-gray-600 truncate">{t.summary}</span>
                </label>
              ))}
            </div>

            {/* Detail level + Craft button */}
            <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-200 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <Layers className="w-4 h-4" />
                  Detail:
                </div>
                {(['high', 'medium', 'low'] as DetailLevel[]).map((lvl) => {
                  const meta = DETAIL_LEVEL_META[lvl];
                  const active = detailLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDetailLevel(lvl)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        active
                          ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title={meta.description}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                <span className="text-[11px] text-gray-400 italic hidden sm:inline">
                  {DETAIL_LEVEL_META[detailLevel].description}
                </span>
              </div>
              {detailLevel === 'low' && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                  <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    <strong>Implementation-level detail works best with Cursor</strong>, which has codebase access.
                    Batch scanning uses Gemini, so code references will be approximate.
                    For precise file/function-level output, process tickets individually via the main workflow with Cursor enabled.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  icon={crafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  loading={crafting}
                  disabled={selected.size === 0}
                  onClick={handleCraft}
                >
                  {crafting ? 'Crafting...' : `Craft ${selected.size} Ticket${selected.size !== 1 ? 's' : ''}`}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setSearchResults([]); setSelected(new Set()); setPhase('idle'); }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === 'results' && searchResults.length === 0 && !searching && (
          <p className="text-xs text-gray-500 italic">No tickets matched the JQL query.</p>
        )}

        {scanResult && !crafting && (
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

        {/* Pending review items */}
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
