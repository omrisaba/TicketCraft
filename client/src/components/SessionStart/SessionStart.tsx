import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useSession } from '../../context/SessionContext';
import { api, setApiCredentials } from '../../services/apiClient';
import { type GeminiModel, type AppConfig } from 'ticketcraft-shared';
import { Shield, Zap, Loader2, KeyRound, FileUp, Download, CheckCircle2 } from 'lucide-react';

type LoginTab = 'manual' | 'file';

const CREDENTIAL_TEMPLATE = {
  jiraEmail: 'you@company.com',
  jiraApiToken: 'your-jira-api-token',
  githubToken: '',
  gitlabToken: '',
};

function downloadTemplate() {
  const blob = new Blob(
    [JSON.stringify(CREDENTIAL_TEMPLATE, null, 2)],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ticketcraft-credentials.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function SessionStart() {
  const { startSession, appConfig, setAppConfig } = useSession();

  const [loginTab, setLoginTab] = useState<LoginTab>('manual');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraApiToken, setJiraApiToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [geminiModel, setGeminiModel] = useState<GeminiModel | ''>('');
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileLoaded, setFileLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileLoad = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileLoaded(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.jiraEmail || !parsed.jiraApiToken) {
          setError('File must contain at least "jiraEmail" and "jiraApiToken".');
          return;
        }
        setJiraEmail(parsed.jiraEmail || '');
        setJiraApiToken(parsed.jiraApiToken || '');
        setGithubToken(parsed.githubToken || '');
        setGitlabToken(parsed.gitlabToken || '');
        setFileLoaded(true);
      } catch {
        setError('Invalid JSON file. Please check the format and try again.');
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  };

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
          {/* Login method tabs */}
          <div className="flex border-b border-gray-200 mb-5">
            <button
              type="button"
              onClick={() => { setLoginTab('manual'); setError(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                loginTab === 'manual'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Enter Credentials
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab('file'); setError(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                loginTab === 'file'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" />
              Load from File
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {loginTab === 'file' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Select a JSON credentials file to auto-fill the form. The file is read locally
                  in your browser and never uploaded.
                </p>

                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileLoad}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<FileUp className="w-4 h-4" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                  {fileLoaded && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Credentials loaded
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  <Download className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <p>
                    Don&apos;t have a credentials file?{' '}
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2 font-medium"
                    >
                      Download template
                    </button>{' '}
                    and fill in your values.
                  </p>
                </div>
              </div>
            )}

            {loginTab === 'manual' && (
              <>
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
              </>
            )}

            {loginTab === 'file' && fileLoaded && (
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Loaded credentials</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-800 truncate">{jiraEmail}</span>
                  <span className="text-gray-500">Jira Token</span>
                  <span className="text-gray-800">{jiraApiToken ? '••••••••' : '(empty)'}</span>
                  <span className="text-gray-500">GitHub Token</span>
                  <span className="text-gray-800">{githubToken ? '••••••••' : '(not set)'}</span>
                  <span className="text-gray-500">GitLab Token</span>
                  <span className="text-gray-800">{gitlabToken ? '••••••••' : '(not set)'}</span>
                </div>
              </div>
            )}

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
                All credentials are stored only in memory for this session.
                They are never saved to disk, local storage, or any server. Closing this tab will erase everything.
              </p>
            </div>

            <p className="text-center">
              <a
                href="/user-guide.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
              >
                User Guide
              </a>
              <span className="text-xs text-gray-400"> · </span>
              <a
                href="/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
              >
                REST API docs (Swagger)
              </a>
              <span className="text-xs text-gray-400"> · </span>
              <a
                href="/api/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-gray-800 underline underline-offset-2"
              >
                openapi.json
              </a>
            </p>

            <Button
              type="submit"
              size="lg"
              loading={loading}
              className="w-full"
              disabled={loginTab === 'file' && !fileLoaded}
            >
              Start Session
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
