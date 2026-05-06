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
}[] = [
  { type: 'bug', label: 'Bug Report', icon: Bug, description: 'Defect with repro steps' },
  { type: 'feature', label: 'Feature', icon: Lightbulb, description: 'New capability with AC' },
  { type: 'spike', label: 'Spike', icon: Search, description: 'Research & investigation' },
  { type: 'tech-debt', label: 'Tech Debt', icon: Wrench, description: 'Refactor & improvement' },
];

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Ticket Template (optional)</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TEMPLATE_OPTIONS.map(({ type, label, icon: Icon, description }) => (
          <button
            key={type}
            type="button"
            aria-pressed={selected === type}
            onClick={() => onSelect(selected === type ? null : type)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-all cursor-pointer',
              selected === type
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600',
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs opacity-70">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
