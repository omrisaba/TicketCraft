import type { Ticket, TicketChanges, Annotation } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ArrowRight, Info } from 'lucide-react';

interface DiffViewProps {
  original: Ticket;
  improved: TicketChanges;
  annotations: Annotation[];
}

function DiffField({
  field,
  originalValue,
  improvedValue,
  annotation,
}: {
  field: string;
  originalValue: string;
  improvedValue: string;
  annotation?: Annotation;
}) {
  const hasChanged = originalValue !== improvedValue;

  if (!hasChanged) return null;

  return (
    <div className="space-y-2 border-b border-gray-100 pb-4 last:border-0">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-700 capitalize">{field}</h4>
        {hasChanged && <Badge variant="info">Changed</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-red-50 border border-red-100 p-3">
          <p className="text-xs font-medium text-red-600 mb-1">Original</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{originalValue || '(empty)'}</p>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-100 p-3">
          <p className="text-xs font-medium text-green-600 mb-1">Improved</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{improvedValue || '(empty)'}</p>
        </div>
      </div>

      {annotation && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">{annotation.reason}</p>
        </div>
      )}
    </div>
  );
}

export function DiffView({ original, improved, annotations }: DiffViewProps) {
  const annotationMap = new Map(annotations.map((a) => [a.field.toLowerCase(), a]));

  const fields = [
    { field: 'summary', original: original.summary, improved: improved.summary },
    { field: 'description', original: original.description || '', improved: improved.description },
    { field: 'acceptance criteria', original: original.acceptanceCriteria || '', improved: improved.acceptanceCriteria },
    { field: 'labels', original: original.labels.join(', '), improved: improved.labels?.join(', ') },
    { field: 'story points', original: String(original.storyPoints ?? ''), improved: improved.storyPoints != null ? String(improved.storyPoints) : undefined },
  ];

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <ArrowRight className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-800">Changes Review</h3>
      </div>

      <div className="space-y-4">
        {fields.map(
          (f) =>
            f.improved !== undefined && (
              <DiffField
                key={f.field}
                field={f.field}
                originalValue={f.original}
                improvedValue={f.improved}
                annotation={annotationMap.get(f.field)}
              />
            ),
        )}
      </div>
    </Card>
  );
}
