import { useState, useEffect, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { RepoContext } from 'ticketcraft-shared';
import { GitBranch, Link2, X, Check } from 'lucide-react';

export function RepoConnector() {
  const { repoContext, setRepoContext } = useSession();
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileChecked = useRef(false);

  useEffect(() => {
    if (profileChecked.current || repoContext) return;
    profileChecked.current = true;
    api.automation.loadProfile()
      .then((profile: any) => {
        if (profile?.repoUrl && !repoContext) {
          setRepoUrl(profile.repoUrl);
        }
      })
      .catch(() => {});
  }, [repoContext]);

  const handleConnect = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const url = repoUrl.trim();
      const ctx = await api.repo.fetchContext(url) as RepoContext;
      setRepoContext(ctx);
      setRepoUrl('');
      api.automation.saveRepoUrl(url).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repository.');
    } finally {
      setLoading(false);
    }
  };

  if (repoContext) {
    const { info } = repoContext;
    const langList = Object.entries(info.languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);
    const totalBytes = Object.values(info.languages).reduce((a, b) => a + b, 0);
    const fileCount = repoContext.tree.filter((e) => e.type === 'blob').length;

    return (
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 text-green-600">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {info.owner}/{info.repo}
                </span>
                <Badge variant="success" size="sm">{info.provider}</Badge>
              </div>
              {info.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{info.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              {langList.map(([lang, bytes]) => (
                <Badge key={lang} size="sm">
                  {lang} {Math.round((bytes / totalBytes) * 100)}%
                </Badge>
              ))}
            </div>
            <span className="text-xs text-gray-400">{fileCount} files</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="w-4 h-4" />}
              onClick={() => { setRepoContext(null); api.automation.saveRepoUrl(null).catch(() => {}); }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 shrink-0">
          <GitBranch className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            aria-label="Repository URL"
            placeholder="GitHub or GitLab repo URL (optional)"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Link2 className="w-4 h-4" />}
          loading={loading}
          onClick={handleConnect}
          disabled={!repoUrl.trim()}
        >
          Connect
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Link a repository so the AI understands your project's architecture and tech stack for more accurate improvements.
      </p>
    </Card>
  );
}
