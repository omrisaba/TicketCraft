import { useState, useEffect, type FormEvent } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useSession } from '../../context/SessionContext';
import { api, setApiCredentials } from '../../services/apiClient';
import { type GeminiModel, type AppConfig } from 'ticketcraft-shared';
import { Shield, Zap, Loader2 } from 'lucide-react';

export function SessionStart() {
  const { startSession, appConfig, setAppConfig } = useSession();

  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraApiToken, setJiraApiToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [geminiModel, setGeminiModel] = useState<GeminiModel | ''>('');
  const [loading, setLoading] = useState(false);
  /** Refetch on every mount so sign-out picks up admin changes (e.g. cursorEnabled). */
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    setError(null);
    api.session
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const config = cfg as AppConfig;
        setAppConfig(config);
        setGeminiModel(config.defaultModel);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load app configuration. Is the server running?');
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setAppConfig]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.session.validate({
        geminiModel: geminiModel || appConfig!.defaultModel,
        jiraEmail,
        jiraApiToken,
      }) as any;

      if (!result.valid) {
        setError(result.errors?.join('. ') || 'Validation failed.');
        setLoading(false);
        return;
      }

      const creds = {
        geminiModel: (geminiModel || appConfig!.defaultModel) as GeminiModel,
        jiraEmail,
        jiraApiToken,
        ...(githubToken.trim() && { githubToken: githubToken.trim() }),
        ...(gitlabToken.trim() && { gitlabToken: gitlabToken.trim() }),
      };

      setApiCredentials(creds);
      startSession(creds, result.jiraUser);
    } catch (err: any) {
      setError(err.message || 'Failed to validate credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-500">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4">
            <Zap className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">TicketCraft</h1>
          <p className="text-gray-500 mt-2">AI-powered Jira ticket quality improvement</p>
          {appConfig && (
            <p className="text-xs text-gray-400 mt-1">
              Connected to {appConfig.jiraBaseUrl.replace('https://', '')}
            </p>
          )}
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Your Jira Credentials</h2>
              <Input
                label="Jira Email"
                type="email"
                placeholder="you@company.com"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
                required
              />
              <Input
                label="Jira API Token"
                isSecret
                placeholder="Your Jira API token"
                value={jiraApiToken}
                onChange={(e) => setJiraApiToken(e.target.value)}
                required
              />
            </div>

            <div className="border-t border-gray-200 pt-5 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Repository Tokens
                <span className="text-xs font-normal text-gray-400 ml-2">optional</span>
              </h2>
              <p className="text-xs text-gray-500 -mt-2">
                Provide personal access tokens to let the AI fetch deeper context from your repos via MCP.
              </p>
              <Input
                label="GitHub Token"
                isSecret
                placeholder="ghp_..."
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
              />
              <Input
                label="GitLab Token"
                isSecret
                placeholder="glpat-..."
                value={gitlabToken}
                onChange={(e) => setGitlabToken(e.target.value)}
              />
            </div>

            {appConfig && (
              <div className="border-t border-gray-200 pt-5 space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">AI Model</h2>
                <Select
                  label="Gemini Model"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value as GeminiModel)}
                  options={appConfig.availableModels.map((m) => ({ value: m.id, label: m.label }))}
                />
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <Shield className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <p>
                All credentials (Jira, GitHub, GitLab) are stored only in memory for this session.
                They are never saved to disk, local storage, or any server. Closing this tab will erase everything.
              </p>
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Start Session
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
