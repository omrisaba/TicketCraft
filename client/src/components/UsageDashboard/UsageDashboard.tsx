import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';
import type { UsageStats, UsageUserSummary } from 'ticketcraft-shared';
import {
  X,
  RefreshCw,
  Users,
  TrendingUp,
  PenLine,
  Upload,
  FilePlus2,
  LogIn,
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function UsageDashboard({ onClose }: Props) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const result = await api.admin.usage() as UsageStats;
      setStats(result);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Usage Analytics</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Aggregated over the last 12 months
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setLoading(true); fetchUsage(); }}
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label="Close usage panel"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {loading && !stats && (
          <div className="text-center py-8 text-sm text-gray-400">Loading usage data...</div>
        )}

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <StatCard
                icon={<LogIn className="w-4 h-4 text-indigo-500" />}
                label="Logins"
                value={stats.totals.logins}
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4 text-green-500" />}
                label="Improvements"
                value={stats.totals.improvements}
              />
              <StatCard
                icon={<PenLine className="w-4 h-4 text-blue-500" />}
                label="Compositions"
                value={stats.totals.compositions}
              />
              <StatCard
                icon={<Upload className="w-4 h-4 text-amber-500" />}
                label="Synced to Jira"
                value={stats.totals.syncsToJira}
              />
              <StatCard
                icon={<FilePlus2 className="w-4 h-4 text-purple-500" />}
                label="Created in Jira"
                value={stats.totals.createsInJira}
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700">
                  Unique Users ({stats.uniqueUsers.length})
                </h4>
              </div>
              {stats.uniqueUsers.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No usage recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-left">
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium text-center">Last Seen</th>
                        <th className="px-3 py-2 font-medium text-center">Logins</th>
                        <th className="px-3 py-2 font-medium text-center">Improvements</th>
                        <th className="px-3 py-2 font-medium text-center">Compositions</th>
                        <th className="px-3 py-2 font-medium text-center">Syncs</th>
                        <th className="px-3 py-2 font-medium text-center">Creates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stats.uniqueUsers.map((u: UsageUserSummary) => (
                        <tr key={u.email} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-mono">{u.email}</td>
                          <td className="px-3 py-2 text-gray-500 text-center whitespace-nowrap">
                            {formatDate(u.lastSeen)}
                          </td>
                          <td className="px-3 py-2 text-center">{u.loginCount}</td>
                          <td className="px-3 py-2 text-center">{u.improvements}</td>
                          <td className="px-3 py-2 text-center">{u.compositions}</td>
                          <td className="px-3 py-2 text-center">{u.syncsToJira}</td>
                          <td className="px-3 py-2 text-center">{u.createsInJira}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!loading && !stats && (
          <p className="text-sm text-gray-400 py-4 text-center">Failed to load usage data.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</div>
    </div>
  );
}
