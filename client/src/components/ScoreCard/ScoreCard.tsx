import type { TicketScore } from 'ticketcraft-shared';
import { getScoreBadge } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { cn } from '../../utils/cn';

interface ScoreCardProps {
  score: TicketScore;
  previousScore?: TicketScore | null;
  compact?: boolean;
}

const BADGE_VARIANT_MAP = {
  exemplary: 'success',
  good: 'info',
  'needs-work': 'warning',
  poor: 'danger',
} as const;

const BADGE_LABEL_MAP = {
  exemplary: 'Exemplary',
  good: 'Good',
  'needs-work': 'Needs Work',
  poor: 'Poor',
} as const;

export function ScoreCard({ score, previousScore, compact = false }: ScoreCardProps) {
  const badge = getScoreBadge(score.overall);
  const scoreDiff = previousScore ? score.overall - previousScore.overall : null;

  return (
    <Card className={cn(!compact && 'space-y-4')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'text-3xl font-bold',
              badge === 'exemplary' && 'text-green-600',
              badge === 'good' && 'text-blue-600',
              badge === 'needs-work' && 'text-yellow-600',
              badge === 'poor' && 'text-red-600',
            )}
          >
            {score.overall}
            <span className="text-lg text-gray-400">/100</span>
          </div>
          <div>
            <Badge variant={BADGE_VARIANT_MAP[badge]}>{BADGE_LABEL_MAP[badge]}</Badge>
            {scoreDiff !== null && scoreDiff !== 0 && (
              <span
                className={cn(
                  'ml-2 text-sm font-medium',
                  scoreDiff > 0 ? 'text-green-600' : 'text-red-600',
                )}
              >
                {scoreDiff > 0 ? '+' : ''}{scoreDiff}
              </span>
            )}
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <p className="text-sm text-gray-600">{score.summary}</p>

          <div className="space-y-3">
            {score.dimensions.map((dim) => (
              <div key={dim.id}>
                <ProgressBar
                  value={dim.score}
                  max={dim.maxScore}
                  label={dim.name}
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-0.5">{dim.feedback}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
