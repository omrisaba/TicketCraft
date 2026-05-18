import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { GeminiModel, RepoContext, DetailLevel } from 'ticketcraft-shared';
import { SKILLS_MARKDOWN_MAX_CHARS, DETAIL_LEVEL_META, suggestedDetailLevel } from 'ticketcraft-shared';
import { ScoreCard } from '../ScoreCard/ScoreCard';
import { GuidingQuestions } from '../GuidingQuestions/GuidingQuestions';
import { DiffView } from '../DiffView/DiffView';
import { TemplateSelector } from '../TemplateSelector/TemplateSelector';
import { ExportPanel } from '../ExportPanel/ExportPanel';
import { SessionHistory } from '../SessionHistory/SessionHistory';
import { ProcessingOverlay } from '../ui/ProcessingOverlay';
import { RepoConnector } from '../RepoConnector/RepoConnector';
import { RefinementChat } from '../RefinementChat/RefinementChat';
import { RepoUsageCard } from '../RepoUsageCard/RepoUsageCard';
import { McpUsageCard } from '../McpUsageCard/McpUsageCard';
import { ReferenceLinks } from '../ReferenceLinks/ReferenceLinks';
import { PendingReviews } from '../PendingReviews/PendingReviews';
import { AdminSettings } from '../AdminSettings/AdminSettings';
import { LogsPanel } from '../LogsPanel/LogsPanel';
import { UsageDashboard } from '../UsageDashboard/UsageDashboard';
import { CreateTicketModal } from '../CreateTicketModal/CreateTicketModal';
import { TicketGraph } from '../TicketGraph/TicketGraph';
import { UserSkillsPanel, isSkillsOverLimit } from './UserSkillsPanel';
import type {
  Ticket,
  TicketScore,
  TicketChanges,
  GuidingQuestion,
  Annotation,
  TicketTemplateType,
  DraftData,
  DraftMetadata,
  RepoUsageSummary,
  ReferenceLink,
  AutomationResult,
  McpUsageStats,
  HistorySnapshot,
  ImproveResponse,
} from 'ticketcraft-shared';
import {
  Search,
  Sparkles,
  RefreshCw,
  Upload,
  LogOut,
  ExternalLink,
  ArchiveRestore,
  X,
  ClipboardCheck,
  Wand2,
  Eye,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  GitBranch,
  AlertTriangle,
  Settings,
  History,
  ScrollText,
  FilePlus2,
  MessageCircleQuestion,
  Home,
  Network,
  Layers,
  Info,
  BookOpen,
  BarChart3,
} from 'lucide-react';

type WorkspaceStep = 'fetch' | 'scored' | 'improving' | 'review';

const STEPS: { id: WorkspaceStep; label: string; icon: typeof ClipboardCheck }[] = [
  { id: 'fetch', label: 'Fetch', icon: Search },
  { id: 'scored', label: 'Analyze', icon: ClipboardCheck },
  { id: 'review', label: 'Review', icon: Eye },
];

export function TicketWorkspace() {
  const { jiraUser, appConfig, credentials, repoContext, setRepoContext, endSession, setGeminiModel, setGeminiTemperature, geminiTemperature, addHistoryEntry, updateHistoryEntry, sessionWarning } = useSession();
  const repoContextPrompt = repoContext?.promptContext || undefined;
  const connectedRepoUrl = repoContext?.info
    ? `https://${repoContext.info.provider}.com/${repoContext.info.owner}/${repoContext.info.repo}`
    : undefined;

  const [referenceLinks, setReferenceLinks] = useState<ReferenceLink[]>([]);

  const formatReferenceContent = (overrideLinks?: ReferenceLink[]): string | undefined => {
    const source = overrideLinks ?? referenceLinks;
    const fetched = source.filter((l) => l.fetched && l.content);
    if (fetched.length === 0) return undefined;
    return fetched.map((l) => `--- ${l.label} (${l.url}) ---\n${l.content}`).join('\n\n');
  };

  const [ticketKey, setTicketKey] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [linkedTickets, setLinkedTickets] = useState<Ticket[]>([]);
  const [score, setScore] = useState<TicketScore | null>(null);
  const [previousScore, setPreviousScore] = useState<TicketScore | null>(null);
  const [originalScore, setOriginalScore] = useState<number | null>(null);
  const [improvements, setImprovements] = useState<TicketChanges | null>(null);
  const [questions, setQuestions] = useState<GuidingQuestion[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [repoUsage, setRepoUsage] = useState<RepoUsageSummary | null>(null);
  const [repoUsageLoading, setRepoUsageLoading] = useState(false);
  const [mcpStats, setMcpStats] = useState<McpUsageStats | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TicketTemplateType | null>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('medium');
  const [aiNudge, setAiNudge] = useState<'cursor' | 'gemini' | null>(null);
  const [step, setStep] = useState<WorkspaceStep>('fetch');
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTicketMap, setShowTicketMap] = useState(false);
  const [useCursor, setUseCursor] = useState(false);
  const [codeInsights, setCodeInsights] = useState<string | null>(null);
  const [cursorFallback, setCursorFallback] = useState(false);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [automationTicketKey, setAutomationTicketKey] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const isAdmin = !!(jiraUser?.emailAddress && appConfig?.adminEmails?.includes(jiraUser.emailAddress.toLowerCase()));

  const [fetchLoading, setFetchLoading] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [draftOffer, setDraftOffer] = useState<DraftMetadata | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  /** Session-only; not persisted in drafts. Cleared with resetWorkspace. */
  const [userSkillsMarkdown, setUserSkillsMarkdown] = useState('');
  const [showUserSkills, setShowUserSkills] = useState(false);
  const draftChecked = useRef(false);
  /** For expanding custom skills once when entering Review with content */
  const priorStepRef = useRef<WorkspaceStep>('fetch');

  const skillsOverLimit = isSkillsOverLimit(userSkillsMarkdown);

  useEffect(() => {
    const was = priorStepRef.current;
    priorStepRef.current = step;
    if (was !== 'review' && step === 'review' && userSkillsMarkdown.trim().length > 0) {
      setShowUserSkills(true);
    }
  }, [step, userSkillsMarkdown]);

  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;
    api.drafts.check()
      .then((meta) => { if (meta) setDraftOffer(meta as DraftMetadata); })
      .catch(() => {});
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (!ticket || step === 'fetch') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const draft: DraftData = {
        ticketKey: ticket.key,
        ticket,
        improvements,
        score,
        previousScore,
        questions,
        annotations,
        userAnswers,
        selectedTemplate,
        repoUrl: connectedRepoUrl || null,
        referenceLinks: referenceLinks.map(({ url, label, fetched, error }) => ({ url, label, fetched, error })),
        step: step === 'improving' ? 'scored' : (step === 'review' && !improvements ? 'scored' : step),
        history: [],
        savedAt: new Date().toISOString(),
      };
      api.drafts.save(draft).catch(() => {});
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [ticket, score, improvements, questions, annotations, userAnswers, selectedTemplate, step, previousScore, repoContext, referenceLinks]);

  const handleResumeDraft = async () => {
    setDraftOffer(null);
    setStatusMessage('Restoring your previous work...');
    try {
      const draft = await api.drafts.load() as DraftData | null;
      if (!draft?.ticket) {
        setStatusMessage(null);
        return;
      }
      setUserSkillsMarkdown('');
      setShowUserSkills(false);
      setTicketKey(draft.ticketKey);
      setTicket(draft.ticket);
      setScore(draft.score);
      setPreviousScore(draft.previousScore);
      setOriginalScore(
        draft.previousScore?.overall ?? draft.score?.overall ?? null,
      );
      setDetailLevel(suggestedDetailLevel(draft.ticket.issueType));
      setImprovements(draft.improvements);
      setQuestions(draft.questions || []);
      setAnnotations(draft.annotations || []);
      setUserAnswers(draft.userAnswers || {});
      setSelectedTemplate(draft.selectedTemplate);
      if (draft.referenceLinks?.length > 0) {
        setReferenceLinks(draft.referenceLinks);
        const urlsToRefetch = draft.referenceLinks.filter((l) => l.fetched).map((l) => l.url);
        if (urlsToRefetch.length > 0) {
          api.repo.fetchUrls(urlsToRefetch)
            .then((results) => {
              setReferenceLinks((prev) => prev.map((l) => {
                const fresh = (results as ReferenceLink[]).find((r) => r.url === l.url);
                return fresh || l;
              }));
            })
            .catch(() => {});
        }
      }
      const restoredStep = draft.step === 'improving' ? 'scored' : draft.step;
      setStep(restoredStep === 'review' && !draft.improvements ? 'scored' : restoredStep);
      if (draft.repoUrl) {
        try {
          const ctx = await api.repo.fetchContext(draft.repoUrl) as RepoContext;
          setRepoContext(ctx);
        } catch { /* repo context is best-effort */ }
      }
    } catch {
      setError('Failed to restore draft.');
    } finally {
      setStatusMessage(null);
    }
  };

  const handleDismissDraft = () => {
    setDraftOffer(null);
    api.drafts.remove().catch(() => {});
  };

  const handleReviewAutomation = async (ticketKey: string) => {
    setError(null);
    setStatusMessage('Loading automated review...');
    try {
      const result = await api.automation.loadResult(ticketKey) as AutomationResult;
      resetWorkspace();
      setTicketKey(result.ticketKey);
      setTicket(result.ticket);
      setScore(result.score);
      setOriginalScore(result.score.overall);
      setDetailLevel(suggestedDetailLevel(result.ticket.issueType));
      setImprovements(result.improvements);
      setAnnotations(result.annotations || []);
      setStep('review');

      addHistoryEntry({
        ticketKey: result.ticketKey,
        ticketSummary: result.ticket.summary,
        scoreBefore: result.score.overall,
        scoreAfter: null,
        syncedAt: null,
        timestamp: new Date().toISOString(),
      });

      saveSnapshot(result.ticket, result.score, result.improvements, result.annotations || []).catch(() => {});
      setAutomationTicketKey(ticketKey);
    } catch (err: any) {
      setError(err.message || 'Failed to load automation result.');
    } finally {
      setStatusMessage(null);
    }
  };

  const resetWorkspace = () => {
    setTicket(null);
    setLinkedTickets([]);
    setScore(null);
    setPreviousScore(null);
    setOriginalScore(null);
    setImprovements(null);
    setQuestions([]);
    setAnnotations([]);
    setRepoUsage(null);
    setMcpStats(null);
    setCodeInsights(null);
    setCursorFallback(false);
    setReferenceLinks([]);
    setSelectedTemplate(null);
    setDetailLevel('medium');
    setAiNudge(null);
    setUserSkillsMarkdown('');
    setShowUserSkills(false);
    setShowTicketMap(false);
    setViewingHistoryId(null);
    setAutomationTicketKey(null);
    setStep('fetch');
    setError(null);
    setStatusMessage(null);
  };

  const handleFetch = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticketKey.trim()) return;
    setError(null);
    setFetchLoading(true);
    const savedLinks = referenceLinks;
    resetWorkspace();
    setReferenceLinks(savedLinks);

    try {
      setStatusMessage('Fetching ticket from Jira...');
      const ticketData = await api.jira.getTicket(ticketKey.trim().toUpperCase()) as Ticket;
      setTicket(ticketData);
      setTicketKey(ticketData.key);
      setDetailLevel(suggestedDetailLevel(ticketData.issueType));

      try {
        setStatusMessage('Loading linked tickets...');
        const linked = await api.jira.getLinkedTickets(ticketData.key) as any[];
        if (linked?.length > 0) {
          const fullLinked: Ticket[] = [];
          for (const lt of linked.slice(0, 5)) {
            try {
              const full = await api.jira.getTicket(lt.key) as Ticket;
              fullLinked.push(full);
            } catch { /* skip inaccessible linked tickets */ }
          }
          setLinkedTickets(fullLinked);
        }
      } catch { /* linked tickets are optional */ }

      setScoreLoading(true);
      setStatusMessage('AI is analyzing ticket quality...');
      const referenceContent = formatReferenceContent(savedLinks);
      const scoreResult = await api.ai.score({ ticket: ticketData, repoContextPrompt, referenceContent, repoUrl: connectedRepoUrl }) as TicketScore;
      setScore(scoreResult);
      setOriginalScore(scoreResult.overall);
      setStep('scored');

      addHistoryEntry({
        ticketKey: ticketData.key,
        ticketSummary: ticketData.summary,
        scoreBefore: scoreResult.overall,
        scoreAfter: null,
        syncedAt: null,
        timestamp: new Date().toISOString(),
      });

    } catch (err: any) {
      setError(err.message || 'Failed to fetch ticket.');
    } finally {
      setFetchLoading(false);
      setScoreLoading(false);
      setStatusMessage(null);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!ticket || !score) return;
    const weakDims = score.dimensions.filter((d) => d.score < 7).map((d) => d.id);
    if (weakDims.length === 0) return;

    setQuestionsLoading(true);
    setStatusMessage('Generating guiding questions...');
    try {
      const referenceContent = formatReferenceContent();
      const qResult = await api.ai.questions({
        ticket,
        weakDimensions: weakDims,
        repoContextPrompt,
        referenceContent,
        repoUrl: connectedRepoUrl,
      }) as { questions: GuidingQuestion[] };
      setQuestions(qResult.questions || []);
    } catch {
      setError('Failed to generate guiding questions.');
    } finally {
      setQuestionsLoading(false);
      setStatusMessage(null);
    }
  };

  const handleImprove = async (answersInput?: Record<string, string>) => {
    if (!ticket) return;
    if (skillsOverLimit) {
      setError(
        `Custom skills exceed ${SKILLS_MARKDOWN_MAX_CHARS.toLocaleString()} characters (after trim).`,
      );
      return;
    }
    if (answersInput) setUserAnswers((prev) => ({ ...prev, ...answersInput }));
    setError(null);
    setImproveLoading(true);
    setStep('improving');

    try {
      setStatusMessage('AI is crafting improvements...');
      const referenceContent = formatReferenceContent();
      const trimmedSkills = userSkillsMarkdown.trim();
      const result = await api.ai.improve({
        ticket,
        templateType: selectedTemplate ?? undefined,
        userAnswers: answersInput,
        linkedTickets: linkedTickets.length > 0 ? linkedTickets : undefined,
        detailLevel,
        repoContextPrompt,
        referenceContent,
        repoUrl: connectedRepoUrl,
        useCursor,
        skillsMarkdown: trimmedSkills === '' ? undefined : trimmedSkills,
      });
      const data = result as ImproveResponse & {
        codeInsights?: string | null;
        cursorFallback?: boolean;
        mcpStats?: McpUsageStats;
      };

      setImprovements(data.improvedTicket);
      setCodeInsights(data.codeInsights || null);
      setCursorFallback(!!data.cursorFallback);
      if (data.mcpStats) setMcpStats(data.mcpStats);

      let resolvedAnnotations: Annotation[] = [];
      try {
        setStatusMessage('Annotating changes...');
        const annotResult = await api.ai.annotate({
          original: ticket,
          improved: result.improvedTicket,
        }) as { annotations: Annotation[] };
        resolvedAnnotations = annotResult.annotations || [];
        setAnnotations(resolvedAnnotations);
      } catch { /* annotations are best-effort */ }

      if (repoContextPrompt) {
        setRepoUsageLoading(true);
        try {
          const usageResult = await api.ai.repoUsage({
            improvedTicket: result.improvedTicket,
            repoContextPrompt,
          }) as RepoUsageSummary;
          setRepoUsage(usageResult);
        } catch { /* repo usage is best-effort */ }
        setRepoUsageLoading(false);
      }

      setStep('review');
      setViewingHistoryId(null);

      if (score) {
        saveSnapshot(ticket, score, result.improvedTicket, resolvedAnnotations).catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to improve ticket.');
      setStep('scored');
    } finally {
      setImproveLoading(false);
      setStatusMessage(null);
    }
  };

  const handleRescore = async () => {
    if (!ticket || !improvements) return;
    setScoreLoading(true);
    setError(null);

    try {
      setStatusMessage('Re-evaluating ticket quality...');
      const updatedTicket: Ticket = {
        ...ticket,
        summary: improvements.summary || ticket.summary,
        description: improvements.description || ticket.description,
        acceptanceCriteria: improvements.acceptanceCriteria || ticket.acceptanceCriteria,
        labels: improvements.labels || ticket.labels,
        storyPoints: improvements.storyPoints ?? ticket.storyPoints,
      };

      setPreviousScore(score);
      const referenceContent = formatReferenceContent();
      const newScore = await api.ai.score({ ticket: updatedTicket, repoContextPrompt, referenceContent, repoUrl: connectedRepoUrl }) as TicketScore;
      setScore(newScore);

      updateHistoryEntry(ticket.key, { scoreAfter: newScore.overall });
    } catch (err: any) {
      setError(err.message || 'Failed to re-score ticket.');
    } finally {
      setScoreLoading(false);
      setStatusMessage(null);
    }
  };

  const handleSync = async () => {
    if (!ticket || !improvements) return;
    setSyncLoading(true);
    setError(null);

    try {
      let finalScore = score;

      if (!previousScore) {
        setStatusMessage('Scoring improved ticket before sync...');
        const updatedTicket: Ticket = {
          ...ticket,
          summary: improvements.summary || ticket.summary,
          description: improvements.description || ticket.description,
          acceptanceCriteria: improvements.acceptanceCriteria || ticket.acceptanceCriteria,
          labels: improvements.labels || ticket.labels,
          storyPoints: improvements.storyPoints ?? ticket.storyPoints,
        };
        const referenceContent = formatReferenceContent();
        finalScore = await api.ai.score({
          ticket: updatedTicket, repoContextPrompt, referenceContent, repoUrl: connectedRepoUrl,
        }) as TicketScore;
        setPreviousScore(score);
        setScore(finalScore);
      }

      setStatusMessage('Syncing changes to Jira...');
      await api.jira.updateTicket(ticket.key, improvements);

      const syncedAt = new Date().toISOString();
      updateHistoryEntry(ticket.key, { scoreAfter: finalScore?.overall ?? null, syncedAt });

      const snapshotId = await saveSnapshot(ticket, finalScore!, improvements, annotations);

      if (snapshotId) {
        api.history.markSynced(snapshotId, {
          syncedAt,
          finalScore: finalScore ? { overall: finalScore.overall } : undefined,
        }).catch(() => {});
      } else if (viewingHistoryId) {
        api.history.markSynced(viewingHistoryId, {
          syncedAt,
          finalScore: finalScore ? { overall: finalScore.overall } : undefined,
        }).catch(() => {});
      }

      if (automationTicketKey) {
        api.automation.dismiss(automationTicketKey).catch(() => {});
      }
      api.drafts.remove().catch(() => {});
      setHistoryRefreshKey((k) => k + 1);
      setStep('fetch');
      resetWorkspace();
    } catch (err: any) {
      setError(err.message || 'Failed to sync to Jira.');
    } finally {
      setSyncLoading(false);
      setStatusMessage(null);
    }
  };

  const handleRefinementUpdate = (updated: TicketChanges) => {
    setImprovements(updated);
  };

  const saveSnapshot = async (t: Ticket, s: TicketScore, imp: TicketChanges, ann: Annotation[]) => {
    const snapshot: HistorySnapshot = {
      id: `${t.key}-${Date.now()}`,
      ticketKey: t.key,
      ticketSummary: t.summary,
      ticket: t,
      score: s,
      originalScore: originalScore ?? s.overall,
      improvements: imp,
      annotations: ann,
      repoUsage,
      mcpStats,
      referenceLinks: referenceLinks.filter((l) => l.fetched),
      repoUrl: connectedRepoUrl || null,
      codeInsights,
      syncedAt: null,
      savedAt: new Date().toISOString(),
    };
    try {
      await api.history.save(snapshot);
      setHistoryRefreshKey((k) => k + 1);
    } catch { /* snapshot save is best-effort */ }
    return snapshot.id;
  };

  const handleViewSnapshot = async (snapshotId: string) => {
    setError(null);
    setStatusMessage('Loading history snapshot...');
    try {
      const snap = await api.history.load(snapshotId) as HistorySnapshot;
      resetWorkspace();
      setViewingHistoryId(snap.id);
      setTicketKey(snap.ticketKey);
      setTicket(snap.ticket);
      setScore(snap.score);
      setOriginalScore(snap.originalScore ?? snap.score.overall);
      setDetailLevel(suggestedDetailLevel(snap.ticket.issueType));
      setAnnotations(snap.annotations || []);
      setRepoUsage(snap.repoUsage || null);
      setMcpStats(snap.mcpStats || null);
      setCodeInsights(snap.codeInsights || null);
      setReferenceLinks(snap.referenceLinks || []);

      const hasImprovements = snap.improvements
        && (snap.improvements.summary || snap.improvements.description
          || snap.improvements.acceptanceCriteria);
      if (hasImprovements) {
        setImprovements(snap.improvements);
        setStep('review');
      } else {
        setStep('scored');
      }
      setShowHistory(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load history snapshot.');
    } finally {
      setStatusMessage(null);
    }
  };

  const handleGoHome = async () => {
    if (ticket && score && step !== 'fetch') {
      await saveSnapshot(ticket, score, improvements ?? {}, annotations).catch(() => {});
    }
    resetWorkspace();
  };

  useEffect(() => {
    if (step === 'review' && (!ticket || !improvements)) {
      setStep(ticket && score ? 'scored' : 'fetch');
    }
  }, [step, ticket, improvements, score]);

  const stepIndex = STEPS.findIndex((s) => s.id === (step === 'improving' ? 'scored' : step));

  const handleDetailLevelChange = (lvl: DetailLevel) => {
    setDetailLevel(lvl);
    if (lvl === 'low' && !useCursor && appConfig?.cursorEnabled) {
      setAiNudge('cursor');
    } else if (lvl !== 'low' && useCursor) {
      setAiNudge('gemini');
    } else {
      setAiNudge(null);
    }
  };

  const detailLevelBar = (
    <div className="space-y-1.5">
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
              onClick={() => handleDetailLevelChange(lvl)}
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
      {aiNudge === 'cursor' && !useCursor && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          <div>
            <strong>Implementation-level detail works best with Cursor</strong>, which reads your codebase to reference real files and functions.{' '}
            <button
              type="button"
              onClick={() => { setUseCursor(true); setAiNudge(null); }}
              className="text-amber-700 underline underline-offset-2 font-semibold hover:text-amber-900"
            >
              Switch to Cursor
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => setAiNudge(null)}
              className="text-amber-600 underline underline-offset-2 hover:text-amber-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {aiNudge === 'gemini' && useCursor && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
          <div>
            <strong>Strategic/Balanced detail doesn&apos;t need codebase access.</strong>{' '}
            Gemini is faster and more cost-effective for high-level improvements.{' '}
            <button
              type="button"
              onClick={() => { setUseCursor(false); setAiNudge(null); }}
              className="text-blue-700 underline underline-offset-2 font-semibold hover:text-blue-900"
            >
              Switch to Gemini
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => setAiNudge(null)}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-base font-bold text-gray-900">TicketCraft</h1>
            </div>
            {ticket && (
              <Badge variant="info">
                <a
                  href={`${appConfig?.jiraBaseUrl}/browse/${ticket.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  {ticket.key} <ExternalLink className="w-3 h-3" />
                </a>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {appConfig && (
              <>
                <select
                  aria-label="AI engine"
                  value={useCursor ? 'cursor' : (credentials?.geminiModel || appConfig.defaultModel)}
                  onChange={(e) => {
                    if (e.target.value === 'cursor') {
                      setUseCursor(true);
                    } else {
                      setUseCursor(false);
                      setGeminiModel(e.target.value as GeminiModel);
                    }
                  }}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {appConfig.availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  {appConfig.cursorEnabled && (
                    <option value="cursor">Cursor (codebase-aware)</option>
                  )}
                </select>
                {!useCursor && (
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-400 hidden sm:inline">Temp</label>
                    <select
                      aria-label="AI temperature"
                      value={geminiTemperature}
                      onChange={(e) => setGeminiTemperature(parseFloat(e.target.value))}
                      className="text-xs border border-gray-300 rounded-md px-1.5 py-1.5 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer w-14"
                    >
                      {Array.from({ length: 11 }, (_, i) => (i / 10).toFixed(1)).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {jiraUser && (
              <span className="text-sm text-gray-600 hidden sm:inline">
                {jiraUser.displayName}
              </span>
            )}
            {step !== 'fetch' && (
              <Button variant="ghost" size="sm" onClick={handleGoHome} title="Back to home">
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setShowUsage(!showUsage); if (!showUsage) { setShowLogs(false); setShowAdmin(false); } }} aria-pressed={showUsage}>
                  <BarChart3 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowLogs(!showLogs); if (!showLogs) { setShowAdmin(false); setShowUsage(false); } }} aria-pressed={showLogs}>
                  <ScrollText className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAdmin(!showAdmin); if (!showAdmin) { setShowLogs(false); setShowUsage(false); } }}>
                  <Settings className="w-4 h-4" />
                </Button>
              </>
            )}
            <a
              href="/user-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="User Guide"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Guide</span>
            </a>
            <Button variant="ghost" size="sm" icon={<LogOut className="w-4 h-4" />} onClick={endSession}>
              <span className="hidden sm:inline">End</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Admin settings panel */}
      {showAdmin && isAdmin && (
        <AdminSettings onClose={() => setShowAdmin(false)} />
      )}

      {showLogs && isAdmin && (
        <LogsPanel onClose={() => setShowLogs(false)} />
      )}

      {showUsage && isAdmin && (
        <UsageDashboard onClose={() => setShowUsage(false)} />
      )}

      {/* History dropdown */}
      {showHistory && (
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <SessionHistory
              onSelectSnapshot={handleViewSnapshot}
              refreshKey={historyRefreshKey}
            />
          </div>
        </div>
      )}

      {/* Status / Error bars */}
      {statusMessage && (
        <div className="border-b border-blue-200 bg-blue-50 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto py-3">
            <ProcessingOverlay message={statusMessage} />
          </div>
        </div>
      )}

      {/* Session expiry warning */}
      {sessionWarning && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto py-2 flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Your session will expire in 2 minutes due to inactivity. Interact with the page to stay active.</span>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — ticket info + score + stepper */}
        {ticket && step !== 'fetch' && (
          <aside className="w-80 border-r border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0 hidden lg:flex">
            {/* Stepper */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-1">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const isCurrent = s.id === (step === 'improving' ? 'scored' : step);
                  const isPast = i < stepIndex;
                  return (
                    <div key={s.id} className="flex items-center gap-1 flex-1">
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        isCurrent ? 'bg-blue-100 text-blue-700' :
                        isPast ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                        {s.label}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-px ${isPast ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ticket summary */}
            <div className="px-4 py-4 border-b border-gray-100 space-y-2">
              <h2 className="text-sm font-bold text-gray-900 leading-tight">{ticket.summary}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge size="sm">{ticket.issueType}</Badge>
                <Badge size="sm" variant={ticket.status === 'Done' ? 'success' : 'default'}>{ticket.status}</Badge>
                {ticket.priority && <Badge size="sm" variant="warning">{ticket.priority}</Badge>}
              </div>
              {(ticket.reporter || ticket.assignee) && (
                <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                  {ticket.reporter && (
                    <span>Reporter: <span className="font-medium text-gray-700">{ticket.reporter}</span></span>
                  )}
                  {ticket.assignee && (
                    <span>Assignee: <span className="font-medium text-gray-700">{ticket.assignee}</span></span>
                  )}
                </div>
              )}
              {ticket.description && (
                <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{ticket.description}</p>
              )}
              {(ticket.parent || ticket.subtasks.length > 0 || linkedTickets.length > 0) && (
                <button
                  onClick={() => setShowTicketMap(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-sm text-blue-700 transition-colors"
                >
                  <Network className="w-4 h-4 shrink-0" />
                  <div className="flex-1 text-left text-xs">
                    {ticket.parent && <span>Parent: <strong>{ticket.parent.key}</strong></span>}
                    {ticket.parent && (ticket.subtasks.length > 0 || linkedTickets.length > 0) ? ' · ' : ''}
                    {ticket.subtasks.length > 0 && <span>{ticket.subtasks.length} subtask{ticket.subtasks.length > 1 ? 's' : ''}</span>}
                    {ticket.subtasks.length > 0 && linkedTickets.length > 0 ? ' · ' : ''}
                    {linkedTickets.length > 0 && <span>{linkedTickets.length} linked</span>}
                  </div>
                  <span className="text-[10px] font-medium text-blue-500">Map</span>
                </button>
              )}
            </div>

            {/* Score */}
            {score && (
              <div className="px-4 py-4 border-b border-gray-100">
                <ScoreCard score={score} previousScore={previousScore} compact />
              </div>
            )}

            {/* Repo context */}
            {repoContext && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <GitBranch className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-medium">{repoContext.info.owner}/{repoContext.info.repo}</span>
                  <Badge size="sm" variant="success">{repoContext.info.provider}</Badge>
                </div>
              </div>
            )}

            {/* Reference links */}
            <div className="px-4 py-3 border-b border-gray-100">
              <ReferenceLinks links={referenceLinks} onChange={setReferenceLinks} />
            </div>

            {/* New Ticket link */}
            <div className="px-4 py-3 mt-auto">
              <button
                onClick={resetWorkspace}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Search className="w-3 h-3" />
                Switch to another ticket
              </button>
            </div>
          </aside>
        )}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Draft offer */}
            {draftOffer && !ticket && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ArchiveRestore className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      You have unsaved work on <span className="font-bold">{draftOffer.ticketKey}</span>
                    </p>
                    <p className="text-xs text-amber-600">
                      {draftOffer.ticketSummary} &middot; saved {new Date(draftOffer.savedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleResumeDraft}>Resume</Button>
                  <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={handleDismissDraft}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Fetch step */}
            {(step === 'fetch' || !ticket) && (
              <div className="space-y-6">
                <Card>
                  <form onSubmit={handleFetch} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        label="Ticket Key"
                        placeholder="e.g., PROJ-123"
                        value={ticketKey}
                        onChange={(e) => setTicketKey(e.target.value.toUpperCase())}
                      />
                    </div>
                    <Button type="submit" loading={fetchLoading} icon={<Search className="w-4 h-4" />}>
                      Fetch & Score
                    </Button>
                    {ticket && (
                      <Button type="button" variant="secondary" onClick={resetWorkspace}>Clear</Button>
                    )}
                  </form>
                </Card>

                <RepoConnector />
                <ReferenceLinks links={referenceLinks} onChange={setReferenceLinks} />

                <PendingReviews onReview={handleReviewAutomation} />
              </div>
            )}

            {/* Scored step — guiding questions + template + improve */}
            {step === 'scored' && ticket && (
              <div className="space-y-6">
                {/* Action bar + detail level sub-row */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      icon={<Sparkles className="w-4 h-4" />}
                      loading={improveLoading}
                      disabled={skillsOverLimit}
                      onClick={() => handleImprove()}
                    >
                      Improve with AI
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<RefreshCw className="w-4 h-4" />}
                      loading={scoreLoading}
                      onClick={handleRescore}
                    >
                      Re-evaluate
                    </Button>
                    {(ticket.parent || ticket.subtasks.length > 0 || ticket.linkedTickets.length > 0) && (
                      <Button
                        variant="secondary"
                        icon={<Network className="w-4 h-4" />}
                        onClick={() => setShowTicketMap(true)}
                      >
                        Ticket Map
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Search className="w-3.5 h-3.5" />}
                      onClick={resetWorkspace}
                    >
                      New Ticket
                    </Button>
                  </div>
                  {detailLevelBar}
                </div>

                {/* Full score details */}
                <ScoreCard score={score!} previousScore={previousScore} />

                {/* Template selector */}
                <TemplateSelector selected={selectedTemplate} onSelect={setSelectedTemplate} />

                <UserSkillsPanel
                  variant="scored"
                  value={userSkillsMarkdown}
                  onChange={setUserSkillsMarkdown}
                  expanded={showUserSkills}
                  onExpandedChange={setShowUserSkills}
                />

                {/* Guiding questions */}
                {questions.length === 0 && score && score.dimensions.some((d) => d.score < 7) && (
                  <Button
                    variant="secondary"
                    icon={questionsLoading
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <MessageCircleQuestion className="w-4 h-4" />}
                    loading={questionsLoading}
                    onClick={handleGenerateQuestions}
                  >
                    Generate Guiding Questions
                  </Button>
                )}
                {questions.length > 0 && (
                  <GuidingQuestions
                    questions={questions}
                    onSubmitAnswers={(answers) => handleImprove(answers)}
                    loading={improveLoading}
                    improveBlocked={skillsOverLimit}
                  />
                )}
              </div>
            )}

            {/* Improving step */}
            {step === 'improving' && (
              <Card>
                <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">AI is working on improvements...</span>
                </div>
              </Card>
            )}

            {/* Review step — diff + chat side by side */}
            {step === 'review' && ticket && improvements && (
              <div className="space-y-6">
                {viewingHistoryId && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      <History className="w-4 h-4" />
                      <span>Viewing saved snapshot — you can still sync or re-generate from here.</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={resetWorkspace}>Back to workspace</Button>
                  </div>
                )}

                {/* Action bar + detail level sub-row */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      icon={<Upload className="w-4 h-4" />}
                      loading={syncLoading}
                      onClick={handleSync}
                    >
                      Sync to Jira
                    </Button>
                    <Button
                      icon={<FilePlus2 className="w-4 h-4" />}
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create New
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<RefreshCw className="w-4 h-4" />}
                      loading={scoreLoading}
                      onClick={handleRescore}
                    >
                      Re-score
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Sparkles className="w-4 h-4" />}
                      loading={improveLoading}
                      disabled={skillsOverLimit}
                      onClick={() => handleImprove()}
                    >
                      Re-generate
                    </Button>
                    <ExportPanel ticket={ticket} improvements={improvements} score={score || undefined} />
                    {(ticket.parent || ticket.subtasks.length > 0 || ticket.linkedTickets.length > 0) && (
                      <Button
                        variant="secondary"
                        icon={<Network className="w-4 h-4" />}
                        onClick={() => setShowTicketMap(true)}
                      >
                        Ticket Map
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Search className="w-3.5 h-3.5" />}
                      onClick={resetWorkspace}
                    >
                      New Ticket
                    </Button>
                  </div>
                  {detailLevelBar}
                </div>

                <UserSkillsPanel
                  variant="review"
                  value={userSkillsMarkdown}
                  onChange={setUserSkillsMarkdown}
                  expanded={showUserSkills}
                  onExpandedChange={setShowUserSkills}
                />

                {/* Repo usage + MCP usage — side by side */}
                {(repoUsage || repoUsageLoading || (mcpStats && mcpStats.used) || codeInsights) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(repoUsage || repoUsageLoading) && (
                      <RepoUsageCard usage={repoUsage} loading={repoUsageLoading} />
                    )}
                    <McpUsageCard stats={mcpStats} />
                    {codeInsights && (
                      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                          </div>
                          <h4 className="text-sm font-semibold text-violet-900">
                            Codebase Insights
                            {cursorFallback && <span className="ml-2 text-[10px] font-normal text-amber-600">(Gemini fallback)</span>}
                          </h4>
                        </div>
                        <p className="text-xs text-violet-800 leading-relaxed">{codeInsights}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Diff view + Chat — side by side on large screens */}
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Diff view takes most of the width */}
                  <div className="flex-1 min-w-0 space-y-4">
                    <DiffView original={ticket} improved={improvements} annotations={annotations} />
                  </div>

                  {/* Refinement chat — fixed width */}
                  <div className="w-full lg:w-80 shrink-0">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-[500px] lg:h-[600px] flex flex-col overflow-hidden sticky top-20">
                      <RefinementChat
                        ticket={ticket}
                        improvements={improvements}
                        repoContextPrompt={repoContextPrompt}
                        referenceContent={formatReferenceContent()}
                        onUpdate={handleRefinementUpdate}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreateModal && ticket && improvements && (
        <CreateTicketModal
          originalKey={ticket.key}
          projectKey={ticket.key.split('-')[0]}
          originalIssueType={ticket.issueType}
          originalTicket={ticket}
          improvements={improvements}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(newKey) => {
            setShowCreateModal(false);
            const syncedAt = new Date().toISOString();
            updateHistoryEntry(ticket.key, { syncedAt });
            if (viewingHistoryId) {
              api.history.markSynced(viewingHistoryId, {
                syncedAt,
                finalScore: score ? { overall: score.overall } : undefined,
              }).catch(() => {});
            }
            if (automationTicketKey) {
              api.automation.dismiss(automationTicketKey).catch(() => {});
            }
            api.drafts.remove().catch(() => {});
            setHistoryRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showTicketMap && ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTicketMap(false)} />
          <div className="relative w-full max-w-4xl mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style={{ height: '70vh' }}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-600" />
                Ticket Map — {ticket.key}
              </h2>
              <button
                onClick={() => setShowTicketMap(false)}
                className="p-1 rounded-md hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div style={{ height: 'calc(100% - 49px)' }}>
              <TicketGraph
                ticket={ticket}
                onTicketClick={(key) => {
                  setShowTicketMap(false);
                  setTicketKey(key);
                  resetWorkspace();
                  setTicketKey(key);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
