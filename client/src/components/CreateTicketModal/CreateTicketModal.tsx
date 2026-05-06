import { useState, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { api } from '../../services/apiClient';
import type { Ticket, TicketChanges } from 'ticketcraft-shared';
import { X, ExternalLink, Plus, Link2, GitBranch } from 'lucide-react';

type CreationMode = 'standalone' | 'linked' | 'subtask';

interface CreateTicketModalProps {
  originalKey: string;
  projectKey: string;
  originalIssueType: string;
  originalTicket: Ticket;
  improvements: TicketChanges;
  onClose: () => void;
  onSuccess: (newKey: string) => void;
}

const CREATION_MODES: { value: CreationMode; label: string; description: string; icon: typeof Plus }[] = [
  { value: 'linked', label: 'Linked Ticket', description: 'Creates a new ticket and links it to the original', icon: Link2 },
  { value: 'subtask', label: 'Sub-task', description: 'Creates a sub-task under the original ticket', icon: GitBranch },
  { value: 'standalone', label: 'Standalone', description: 'Creates an independent ticket with no link', icon: Plus },
];

const ISSUE_TYPES = [
  { value: 'Story', label: 'Story' },
  { value: 'Task', label: 'Task' },
  { value: 'Bug', label: 'Bug' },
  { value: 'Epic', label: 'Epic' },
];

export function CreateTicketModal({
  originalKey,
  projectKey,
  originalIssueType,
  originalTicket,
  improvements,
  onClose,
  onSuccess,
}: CreateTicketModalProps) {
  const merged = useMemo<TicketChanges>(() => ({
    summary: improvements.summary || originalTicket.summary,
    description: improvements.description ?? originalTicket.description ?? undefined,
    acceptanceCriteria: improvements.acceptanceCriteria ?? originalTicket.acceptanceCriteria ?? undefined,
    labels: improvements.labels ?? originalTicket.labels,
    storyPoints: improvements.storyPoints ?? originalTicket.storyPoints ?? undefined,
  }), [improvements, originalTicket]);

  const [mode, setMode] = useState<CreationMode>('linked');
  const [issueType, setIssueType] = useState(
    mode === 'subtask' ? 'Sub-task' : originalIssueType || 'Story',
  );
  const [summary, setSummary] = useState(merged.summary || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const effectiveIssueType = mode === 'subtask' ? 'Sub-task' : issueType;

  const handleCreate = async () => {
    if (!summary.trim()) {
      setError('Summary is required.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await api.jira.createTicket({
        projectKey,
        issueType: effectiveIssueType,
        changes: { ...merged, summary: summary.trim() },
        parentKey: mode === 'subtask' ? originalKey : undefined,
        linkToOriginal: mode === 'linked',
        originalKey: mode !== 'standalone' ? originalKey : undefined,
      });

      setCreatedKey(result.key);
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            {createdKey ? 'Ticket Created' : 'Create New Ticket'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdKey ? (
          <div className="p-6 space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center space-y-2">
              <div className="text-green-700 font-semibold text-lg">{createdKey}</div>
              <p className="text-sm text-green-600">
                {mode === 'linked'
                  ? `Created and linked to ${originalKey}`
                  : mode === 'subtask'
                    ? `Created as a sub-task of ${originalKey}`
                    : 'Created as a standalone ticket'}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => onSuccess(createdKey)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <p className="text-sm text-gray-600">
              Create a new Jira ticket with the AI-improved content instead of overwriting{' '}
              <span className="font-mono font-medium text-gray-800">{originalKey}</span>.
            </p>

            {/* Mode selector */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Creation mode</label>
              <div className="grid grid-cols-3 gap-2">
                {CREATION_MODES.map((m) => {
                  const Icon = m.icon;
                  const selected = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        setMode(m.value);
                        if (m.value === 'subtask') setIssueType('Sub-task');
                        else if (issueType === 'Sub-task') setIssueType(originalIssueType || 'Story');
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                {CREATION_MODES.find((m) => m.value === mode)?.description}
              </p>
            </div>

            {/* Issue type selector — hidden for sub-task since it's forced */}
            {mode !== 'subtask' && (
              <Select
                label="Issue type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                options={ISSUE_TYPES}
              />
            )}

            <Input
              label="Summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ticket summary"
            />

            {/* Content that will be included */}
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">The new ticket will include:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Summary {improvements.summary ? '(improved)' : '(from original)'}</li>
                {merged.description && (
                  <li>Description {improvements.description ? '(improved)' : '(from original)'}</li>
                )}
                {merged.acceptanceCriteria && (
                  <li>Acceptance criteria {improvements.acceptanceCriteria ? '(improved)' : '(from original)'}</li>
                )}
                {merged.labels?.length ? (
                  <li>{merged.labels.length} label(s) {improvements.labels ? '(improved)' : '(from original)'}</li>
                ) : null}
                {merged.storyPoints != null && (
                  <li>Story points: {merged.storyPoints} {improvements.storyPoints != null ? '(improved)' : '(from original)'}</li>
                )}
                {mode === 'linked' && <li>Link to original ticket ({originalKey})</li>}
                {mode === 'linked' && <li>Reference comment on {originalKey}</li>}
              </ul>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                icon={<ExternalLink className="w-4 h-4" />}
                loading={loading}
                onClick={handleCreate}
              >
                Create Ticket
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
