import type { McpUsageStats } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Wrench, Clock, CheckCircle2, XCircle, GitBranch, Layers } from 'lucide-react';

interface McpUsageCardProps {
  stats: McpUsageStats | null;
}

export function McpUsageCard({ stats }: McpUsageCardProps) {
  if (!stats || !stats.used) return null;

  const successCount = stats.calls.filter((c) => c.success).length;
  const failCount = stats.calls.filter((c) => !c.success).length;

  return (
    <Card padding="sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-800">MCP Tool Usage</h4>
          </div>
          <Badge variant={failCount === 0 ? 'success' : 'warning'} size="sm">
            {stats.toolCallsMade} call{stats.toolCallsMade !== 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            {stats.provider === 'github' ? 'GitHub' : 'GitLab'} MCP
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {stats.toolsAvailable} tools available
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {stats.roundsUsed} round{stats.roundsUsed !== 1 ? 's' : ''} · {(stats.elapsedMs / 1000).toFixed(1)}s
          </span>
        </div>

        {stats.calls.length > 0 && (
          <div className="space-y-1.5">
            {stats.calls.map((call, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {call.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono text-[10px]">
                    {call.tool}
                  </code>
                  {call.reasoning && (
                    <p className="text-gray-400 mt-0.5 leading-snug">{call.reasoning}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {failCount > 0 && (
          <p className="text-[10px] text-amber-600">
            {failCount} tool call{failCount !== 1 ? 's' : ''} failed — results may be less accurate.
          </p>
        )}
      </div>
    </Card>
  );
}
