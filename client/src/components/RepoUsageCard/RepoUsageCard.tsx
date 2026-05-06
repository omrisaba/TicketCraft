import type { RepoUsageSummary } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { GitBranch, FileCode, Layers, Cpu, Loader2 } from 'lucide-react';

interface RepoUsageCardProps {
  usage: RepoUsageSummary | null;
  loading?: boolean;
}

const RELEVANCE_CONFIG = {
  high: { variant: 'success' as const, label: 'High Relevance' },
  medium: { variant: 'warning' as const, label: 'Medium Relevance' },
  low: { variant: 'default' as const, label: 'Low Relevance' },
};

export function RepoUsageCard({ usage, loading }: RepoUsageCardProps) {
  if (loading) {
    return (
      <Card padding="sm">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analyzing how your repo influenced the improvements...</span>
        </div>
      </Card>
    );
  }

  if (!usage) return null;

  const cfg = RELEVANCE_CONFIG[usage.relevance];

  return (
    <Card padding="sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-semibold text-gray-800">Repo Context Usage</h4>
          </div>
          <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">{usage.summary}</p>

        {usage.references.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <FileCode className="w-3 h-3" />
              Referenced Files
            </div>
            <div className="space-y-1 pl-4">
              {usage.references.map((ref, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <code className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded shrink-0 font-mono text-[10px]">
                    {ref.file}
                  </code>
                  <span className="text-gray-500">{ref.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {usage.patterns.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Layers className="w-3 h-3" />
              Patterns Identified
            </div>
            <div className="flex flex-wrap gap-1 pl-4">
              {usage.patterns.map((p, i) => (
                <span key={i} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {usage.techStack.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Cpu className="w-3 h-3" />
              Tech Stack
            </div>
            <div className="flex flex-wrap gap-1 pl-4">
              {usage.techStack.map((t, i) => (
                <span key={i} className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
