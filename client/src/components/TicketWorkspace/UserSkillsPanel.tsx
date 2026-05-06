import { Card } from '../ui/Card';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import { SKILLS_MARKDOWN_MAX_CHARS } from 'ticketcraft-shared';

export interface UserSkillsPanelProps {
  value: string;
  onChange: (value: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Scored vs review copy for the helper line only */
  variant?: 'scored' | 'review';
}

/** Session-only Markdown rules inlined into AI improve prompts; not persisted. */
export function UserSkillsPanel({
  value,
  onChange,
  expanded,
  onExpandedChange,
  variant = 'scored',
}: UserSkillsPanelProps) {
  const effectiveLen = value.trim().length;
  const overLimit = effectiveLen > SKILLS_MARKDOWN_MAX_CHARS;

  const help =
    variant === 'review'
      ? 'Edits apply to the next Re-generate run. Session-only — not saved with drafts or history. If a rule conflicts with accuracy, prefer a correct Jira-ready ticket.'
      : 'Session-only — not saved with drafts or history. If a rule conflicts with accuracy, prefer a correct Jira-ready ticket.';

  return (
    <Card>
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="w-full flex items-center justify-between gap-2 text-left text-sm font-medium text-gray-800"
      >
        <span className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-indigo-600 shrink-0" />
          Custom skills (Markdown)
          {effectiveLen > 0 && (
            <span className="text-xs font-normal text-gray-500">
              ({effectiveLen.toLocaleString()} chars, max{' '}
              {SKILLS_MARKDOWN_MAX_CHARS.toLocaleString()})
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">{help}</p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            placeholder="e.g. Use our team template headings; prefer user-story format; keep AC as checkboxes…"
            spellCheck={false}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              {effectiveLen.toLocaleString()} / {SKILLS_MARKDOWN_MAX_CHARS.toLocaleString()}{' '}
              (after trim)
            </span>
            {overLimit && (
              <span className="text-red-600 font-medium">
                Exceeds limit — shorten to enable Improve / Re-generate.
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
