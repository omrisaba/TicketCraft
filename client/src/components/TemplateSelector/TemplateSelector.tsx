import type { TicketTemplateType } from 'ticketcraft-shared';
import { cn } from '../../utils/cn';
import { Bug, Lightbulb, Search, Wrench } from 'lucide-react';

interface TemplateSelectorProps {
  selected: TicketTemplateType | null;
  onSelect: (type: TicketTemplateType | null) => void;
}

const TEMPLATE_OPTIONS: {
  type: TicketTemplateType;
  label: string;
  icon: typeof Bug;
  description: string;
  tooltip: string;
}[] = [
  { type: 'bug', label: 'Bug Report', icon: Bug, description: 'Defect with repro steps',
    tooltip: 'A confirmed defect in existing functionality. Use when something is broken, behaves unexpectedly, or produces incorrect results. Includes reproduction steps, expected vs. actual behavior.' },
  { type: 'feature', label: 'Feature', icon: Lightbulb, description: 'New capability with AC',
    tooltip: 'A new capability or user-facing functionality. Use for net-new work with clear acceptance criteria, user stories, and scope definition.' },
  { type: 'spike', label: 'Spike', icon: Search, description: 'Research & investigation',
    tooltip: 'A time-boxed research or investigation task. Use when the team needs to explore a technical approach, evaluate options, or reduce uncertainty before committing to implementation.' },
  { type: 'tech-debt', label: 'Tech Debt', icon: Wrench, description: 'Refactor & improvement',
    tooltip: 'Refactoring, cleanup, or infrastructure improvement. Use for code quality work that does not change user-visible behavior but improves maintainability, performance, or developer experience.' },
];

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Ticket Template (optional)</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TEMPLATE_OPTIONS.map(({ type, label, icon: Icon, description, tooltip }) => (
          <button
            key={type}
            type="button"
            aria-pressed={selected === type}
            onClick={() => onSelect(selected === type ? null : type)}
            className={cn(
              'group relative flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-all cursor-pointer',
              selected === type
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600',
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs opacity-70">{description}</span>
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {tooltip}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
