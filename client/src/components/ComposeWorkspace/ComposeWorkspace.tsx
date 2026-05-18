import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Combobox } from '../ui/Combobox';
import { ProcessingOverlay } from '../ui/ProcessingOverlay';
import { TemplateSelector } from '../TemplateSelector/TemplateSelector';
import { RepoConnector } from '../RepoConnector/RepoConnector';
import { ReferenceLinks } from '../ReferenceLinks/ReferenceLinks';
import { BreakdownPanel } from '../BreakdownPanel/BreakdownPanel';
import { AdminSettings } from '../AdminSettings/AdminSettings';
import { LogsPanel } from '../LogsPanel/LogsPanel';
import { UsageDashboard } from '../UsageDashboard/UsageDashboard';
import { Badge } from '../ui/Badge';
import type {
  Ticket,
  TicketChanges,
  TicketTemplateType,
  DetailLevel,
  JiraProject,
  JiraIssueType,
  ReferenceLink,
  SubtaskProposal,
  BatchCreateResponse,
  GeminiModel,
  JiraUser,
  TicketScore,
  HistorySnapshot,
} from 'ticketcraft-shared';
import { DETAIL_LEVEL_META, suggestedDetailLevel } from 'ticketcraft-shared';
import {
  Sparkles, Send, RefreshCw, ArrowLeft,
  Layers, CheckCircle2, Loader2, PenLine, BookOpen,
  Settings, ScrollText, BarChart3,
} from 'lucide-react';

type ComposeStep = 'setup' | 'composing' | 'review' | 'breaking' | 'breakdown' | 'creating' | 'done';

export function ComposeWorkspace() {
  const { repoContext, appConfig, credentials, jiraUser, setGeminiModel, setGeminiTemperature, geminiTemperature, addHistoryEntry } = useSession();

  // Setup state
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [allIssueTypes, setAllIssueTypes] = useState<JiraIssueType[]>([]);
  const [projectKey, setProjectKey] = useState('');
  const [issueType, setIssueType] = useState('');
  const [freeText, setFreeText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TicketTemplateType | null>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('medium');
  const [referenceLinks, setReferenceLinks] = useState<ReferenceLink[]>([]);
  const [assignee, setAssignee] = useState<JiraUser | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<JiraUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Result state
  const [composed, setComposed] = useState<TicketChanges | null>(null);
  const [breakdownTasks, setBreakdownTasks] = useState<SubtaskProposal[]>([]);
  const [breakdownRationale, setBreakdownRationale] = useState('');
  const [batchResult, setBatchResult] = useState<BatchCreateResponse | null>(null);
  const [singleCreatedKey, setSingleCreatedKey] = useState<string | null>(null);

  // UI state
  const [step, setStep] = useState<ComposeStep>('setup');
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [useCursor, setUseCursor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showUsage, setShowUsage] = useState(false);

  const isAdmin = !!(jiraUser?.emailAddress && appConfig?.adminEmails?.includes(jiraUser.emailAddress.toLowerCase()));

  useEffect(() => {
    setLoadingProjects(true);
    api.jira.getProjects().then((p) => {
      setProjects(p);
      if (p.length > 0 && !projectKey) {
        setProjectKey(p[0].key);
      }
    }).catch(() => {}).finally(() => setLoadingProjects(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSearch = useCallback((query: string) => {
    setLoadingProjects(true);
    api.jira.getProjects(query || undefined).then((p) => {
      setProjects(p);
    }).catch(() => {}).finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    setAssignee(null);
    setAssignableUsers([]);
    api.jira.getIssueTypes(projectKey).then((types) => {
      setAllIssueTypes(types);
      const nonSubtask = types.filter((t) => !t.subtask);
      setIssueTypes(nonSubtask);
      if (nonSubtask.length > 0 && !nonSubtask.some((t) => t.name === issueType)) {
        const story = nonSubtask.find((t) => t.name === 'Story');
        setIssueType(story?.name || nonSubtask[0].name);
      }
    }).catch(() => {});
    api.jira.getAssignableUsers(projectKey).then(setAssignableUsers).catch(() => {});
  }, [projectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUserSearch = useCallback((query: string) => {
    if (!projectKey) return;
    setLoadingUsers(true);
    api.jira.getAssignableUsers(projectKey, query || undefined)
      .then(setAssignableUsers)
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [projectKey]);

  useEffect(() => {
    if (issueType) setDetailLevel(suggestedDetailLevel(issueType));
  }, [issueType]);

  const referenceContent = referenceLinks
    .filter((l) => l.fetched && l.content)
    .map((l) => `### ${l.label || l.url}\n${l.content}`)
    .join('\n\n') || undefined;

  const repoContextPrompt = repoContext?.promptContext;
  const connectedRepoUrl = repoContext
    ? `https://${repoContext.info.provider}.com/${repoContext.info.owner}/${repoContext.info.repo}`
    : undefined;

  const buildTicketForScore = (key: string, id: string, changes: TicketChanges): Ticket => ({
    id, key,
    summary: changes.summary || '',
    description: changes.description || null,
    acceptanceCriteria: changes.acceptanceCriteria || null,
    labels: changes.labels || [],
    storyPoints: changes.storyPoints ?? null,
    status: 'Open', priority: null, assignee: null,
    reporter: null, reporterEmail: null,
    issueType, parent: null, subtasks: [],
    linkedTickets: [], attachments: [], comments: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    rawAdf: null,
  });

  const scoreAndSaveHistory = async (key: string, id: string, changes: TicketChanges) => {
    const ticket = buildTicketForScore(key, id, changes);
    let score: TicketScore;
    try {
      score = await api.ai.score({ ticket, repoContextPrompt, referenceContent, repoUrl: connectedRepoUrl }) as TicketScore;
    } catch {
      score = { overall: 0, categories: {} } as unknown as TicketScore;
    }

    const snapshot: HistorySnapshot = {
      id: `compose-${key}-${Date.now()}`,
      ticketKey: key,
      ticketSummary: changes.summary || '',
      ticket,
      score,
      improvements: changes,
      annotations: [],
      repoUsage: null,
      mcpStats: null,
      referenceLinks,
      repoUrl: connectedRepoUrl || null,
      codeInsights: null,
      syncedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      type: 'created',
    };
    await api.history.save(snapshot).catch(() => {});

    addHistoryEntry({
      ticketKey: key,
      ticketSummary: changes.summary || '',
      scoreBefore: score.overall,
      scoreAfter: null,
      syncedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      type: 'created',
    });
  };

  const handleCompose = useCallback(async () => {
    if (!freeText.trim() || !projectKey) return;
    setStep('composing');
    setError(null);

    try {
      const result = await api.ai.compose({
        freeText,
        projectKey,
        issueType,
        templateType: selectedTemplate ?? undefined,
        detailLevel,
        repoContextPrompt,
        referenceContent,
        repoUrl: connectedRepoUrl,
        useCursor,
      });
      setComposed(result.improvedTicket);
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Composition failed.');
      setStep('setup');
    }
  }, [freeText, projectKey, issueType, selectedTemplate, detailLevel, repoContextPrompt, referenceContent, connectedRepoUrl, useCursor]);

  const handleBreakdown = async () => {
    if (!composed) return;
    setStep('breaking');
    setError(null);

    try {
      const result = await api.ai.breakdown({
        ticket: composed,
        projectKey,
        issueType,
        detailLevel,
        repoContextPrompt,
        referenceContent,
        repoUrl: connectedRepoUrl,
        useCursor,
      });
      setBreakdownTasks(result.tasks);
      setBreakdownRationale(result.rationale);
      setStep('breakdown');
    } catch (err: any) {
      setError(err.message || 'Breakdown failed.');
      setStep('review');
    }
  };

  const handleCreateSingle = async () => {
    if (!composed) return;
    setLoading(true);
    setError(null);

    try {
      const result = await api.jira.createTicket({
        projectKey,
        issueType,
        changes: composed,
        assigneeAccountId: assignee?.accountId,
      });
      setSingleCreatedKey(result.key);
      scoreAndSaveHistory(result.key, result.id, composed).catch(() => {});
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket.');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCreate = async () => {
    if (!composed || breakdownTasks.length === 0) return;
    setStep('creating');
    setError(null);

    try {
      const subtaskIssueTypes = allIssueTypes.filter((t) => t.subtask);
      const subtaskTypeName = subtaskIssueTypes.length > 0 ? subtaskIssueTypes[0].name : 'Sub-task';

      const result = await api.jira.batchCreateTickets({
        parentTicket: { projectKey, issueType, changes: composed, assigneeAccountId: assignee?.accountId },
        subtasks: breakdownTasks.map((t) => ({
          issueType: subtaskTypeName,
          changes: {
            summary: t.summary,
            description: t.description,
            acceptanceCriteria: t.acceptanceCriteria,
            labels: t.labels,
            storyPoints: t.storyPoints ?? undefined,
          },
        })),
      });
      setBatchResult(result);
      scoreAndSaveHistory(result.parent.key, result.parent.id, composed).catch(() => {});
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Batch creation failed.');
      setStep('breakdown');
    }
  };

  const reset = () => {
    setStep('setup');
    setComposed(null);
    setBreakdownTasks([]);
    setBreakdownRationale('');
    setBatchResult(null);
    setSingleCreatedKey(null);
    setFreeText('');
    setError(null);
    setSelectedTemplate(null);
    setAssignee(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">Create Ticket from Scratch</h1>
          </div>
          <a
            href="/user-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            title="User Guide"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Guide</span>
          </a>
        </div>
        {appConfig && (
          <div className="flex items-center gap-2">
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
              {appConfig.cursorEnabled && credentials?.cursorApiKey && (
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
            {isAdmin && (
              <>
                <button onClick={() => { setShowUsage(!showUsage); if (!showUsage) { setShowLogs(false); setShowAdmin(false); } }} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Usage Analytics">
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) { setShowAdmin(false); setShowUsage(false); } }} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="System Logs">
                  <ScrollText className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => { setShowAdmin(!showAdmin); if (!showAdmin) { setShowLogs(false); setShowUsage(false); } }} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Admin Settings">
                  <Settings className="w-4 h-4 text-gray-500" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showAdmin && isAdmin && (
        <AdminSettings onClose={() => setShowAdmin(false)} />
      )}
      {showLogs && isAdmin && (
        <LogsPanel onClose={() => setShowLogs(false)} />
      )}
      {showUsage && isAdmin && (
        <UsageDashboard onClose={() => setShowUsage(false)} />
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── SETUP ── */}
      {step === 'setup' && (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Describe what this ticket is about
              </label>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={6}
                placeholder="Write a rough description of what needs to be done. The AI will transform this into a well-structured Jira ticket..."
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Combobox
                label="Project"
                value={projectKey}
                onChange={setProjectKey}
                loading={loadingProjects}
                placeholder="Search projects..."
                onSearch={handleProjectSearch}
                options={projects.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}` }))}
              />
              <Select
                label="Issue Type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                disabled={issueTypes.length === 0}
                options={
                  issueTypes.length === 0
                    ? [{ value: '', label: projectKey ? 'Loading...' : 'Select a project first' }]
                    : issueTypes.map((t) => ({ value: t.name, label: t.name }))
                }
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detail Level</label>
                <div className="flex gap-1">
                  {(Object.entries(DETAIL_LEVEL_META) as [DetailLevel, { label: string }][]).map(
                    ([level, meta]) => (
                      <button
                        key={level}
                        onClick={() => setDetailLevel(level)}
                        className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all cursor-pointer ${
                          detailLevel === level
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {meta.label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Combobox
                label="Assignee (optional)"
                value={assignee?.accountId || ''}
                onChange={(val) => {
                  if (!val) { setAssignee(null); return; }
                  const user = assignableUsers.find((u) => u.accountId === val);
                  setAssignee(user || null);
                }}
                loading={loadingUsers}
                disabled={!projectKey}
                placeholder="Search users..."
                onSearch={handleUserSearch}
                options={assignableUsers.map((u) => ({ value: u.accountId, label: u.displayName }))}
              />
            </div>

            <TemplateSelector selected={selectedTemplate} onSelect={setSelectedTemplate} />

            <RepoConnector />
            <ReferenceLinks links={referenceLinks} onChange={setReferenceLinks} />

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button
                icon={<Sparkles className="w-4 h-4" />}
                onClick={handleCompose}
                disabled={!freeText.trim() || !projectKey || !issueType || loadingProjects}
                size="lg"
              >
                Generate Ticket
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── COMPOSING ── */}
      {step === 'composing' && (
        <ProcessingOverlay message="Composing your ticket with AI..." />
      )}

      {/* ── REVIEW ── */}
      {step === 'review' && composed && (
        <div className="space-y-5">
          <Card>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Summary</label>
                <input
                  value={composed.summary || ''}
                  onChange={(e) => setComposed({ ...composed, summary: e.target.value })}
                  className="w-full text-base font-semibold border-0 border-b border-gray-200 focus:border-blue-500 focus:outline-none bg-transparent px-0 py-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea
                  value={composed.description || ''}
                  onChange={(e) => setComposed({ ...composed, description: e.target.value })}
                  rows={12}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Acceptance Criteria</label>
                <textarea
                  value={composed.acceptanceCriteria || ''}
                  onChange={(e) => setComposed({ ...composed, acceptanceCriteria: e.target.value })}
                  rows={6}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Labels</label>
                  <div className="flex gap-1 flex-wrap">
                    {(composed.labels || []).map((l) => (
                      <Badge key={l} size="sm">{l}</Badge>
                    ))}
                    {(!composed.labels || composed.labels.length === 0) && (
                      <span className="text-xs text-gray-400">None</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Story Points</label>
                  <span className="text-sm font-semibold">{composed.storyPoints ?? '—'}</span>
                </div>
              </div>

              <div className="text-xs text-gray-400">
                Project: <span className="font-medium">{projectKey}</span> · Type: <span className="font-medium">{issueType}</span>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                icon={<ArrowLeft className="w-4 h-4" />}
                onClick={() => setStep('setup')}
              >
                Back
              </Button>
              <Button
                variant="secondary"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={handleCompose}
              >
                Regenerate
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={<Layers className="w-4 h-4" />}
                onClick={handleBreakdown}
              >
                Break Down into Tasks
              </Button>
              <Button
                icon={<Send className="w-4 h-4" />}
                onClick={handleCreateSingle}
                loading={loading}
              >
                Create Ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── BREAKING ── */}
      {step === 'breaking' && (
        <ProcessingOverlay message="Breaking down into tasks..." />
      )}

      {/* ── BREAKDOWN ── */}
      {step === 'breakdown' && composed && (
        <div className="space-y-5">
          <Card padding="sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">Parent ticket</span>
                <p className="text-sm font-medium text-gray-900">{composed.summary}</p>
              </div>
              <Badge>{issueType}</Badge>
            </div>
          </Card>

          <BreakdownPanel
            tasks={breakdownTasks}
            rationale={breakdownRationale}
            parentStoryPoints={composed.storyPoints ?? null}
            onTasksChange={setBreakdownTasks}
          />

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                icon={<ArrowLeft className="w-4 h-4" />}
                onClick={() => setStep('review')}
              >
                Back to Review
              </Button>
              <Button
                variant="secondary"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={handleBreakdown}
              >
                Regenerate Breakdown
              </Button>
            </div>
            <Button
              icon={<Send className="w-4 h-4" />}
              onClick={handleBatchCreate}
              disabled={breakdownTasks.length === 0 || breakdownTasks.some((t) => !t.summary.trim())}
            >
              Create All ({1 + breakdownTasks.length} tickets)
            </Button>
          </div>
        </div>
      )}

      {/* ── CREATING ── */}
      {step === 'creating' && (
        <Card>
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">
              Creating {1 + breakdownTasks.length} tickets in Jira...
            </p>
          </div>
        </Card>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <Card>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              <span className="text-lg font-semibold">Tickets Created</span>
            </div>

            {singleCreatedKey && (
              <div className="text-center">
                <a
                  href={`${appConfig?.jiraBaseUrl}/browse/${singleCreatedKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xl font-bold text-blue-600 hover:underline"
                >{singleCreatedKey}</a>
              </div>
            )}

            {batchResult && (
              <div className="space-y-3">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <p className="text-sm font-medium text-green-800">
                    Parent: <a
                      href={`${appConfig?.jiraBaseUrl}/browse/${batchResult.parent.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-green-700 hover:underline"
                    >{batchResult.parent.key}</a>
                  </p>
                </div>
                {batchResult.subtasks.length > 0 && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
                    <p className="text-xs font-medium text-blue-800 mb-2">Sub-tasks:</p>
                    {batchResult.subtasks.map((st) => (
                      <div key={st.key} className="flex items-center gap-2 text-sm">
                        <a
                          href={`${appConfig?.jiraBaseUrl}/browse/${st.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-medium text-blue-700 hover:underline"
                        >{st.key}</a>
                        <span className="text-gray-600">{st.summary}</span>
                      </div>
                    ))}
                  </div>
                )}
                {batchResult.errors.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                    <p className="text-xs font-medium text-amber-800 mb-2">
                      {batchResult.errors.length} task(s) failed:
                    </p>
                    {batchResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        {e.summary || `Task ${e.index + 1}`}: {e.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={reset}>
                Create Another Ticket
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
