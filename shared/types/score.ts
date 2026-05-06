export interface TicketScore {
  overall: number;
  dimensions: DimensionScore[];
  summary: string;
}

export interface DimensionScore {
  id: DimensionId;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  feedback: string;
}

export type DimensionId =
  | 'clarity'
  | 'completeness'
  | 'actionability'
  | 'testability'
  | 'formatting'
  | 'context';

export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
  clarity: 0.2,
  completeness: 0.25,
  actionability: 0.2,
  testability: 0.15,
  formatting: 0.1,
  context: 0.1,
};

export type ScoreBadge = 'exemplary' | 'good' | 'needs-work' | 'poor';

export function getScoreBadge(score: number): ScoreBadge {
  if (score >= 90) return 'exemplary';
  if (score >= 70) return 'good';
  if (score >= 50) return 'needs-work';
  return 'poor';
}
