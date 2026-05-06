import { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { AdminSettings as AdminSettingsType, GeminiModel } from 'ticketcraft-shared';
import { AVAILABLE_MODELS } from 'ticketcraft-shared';
import { Save, Loader2, X, CheckCircle2 } from 'lucide-react';

interface AdminSettingsProps {
  onClose: () => void;
}

export function AdminSettings({ onClose }: AdminSettingsProps) {
  const [settings, setSettings] = useState<AdminSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.loadSettings()
      .then((data) => setSettings(data as AdminSettingsType))
      .catch((err: any) => setError(err.message || 'Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.admin.saveSettings(settings) as AdminSettingsType;
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading admin settings...
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-red-600">{error || 'Unable to load settings.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <Card>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Admin Settings</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Default AI Model</label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value as GeminiModel })}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400">Users can override per session.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Default Temperature</label>
                <select
                  value={settings.defaultTemperature.toFixed(1)}
                  onChange={(e) => setSettings({ ...settings, defaultTemperature: parseFloat(e.target.value) })}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 11 }, (_, i) => (i / 10).toFixed(1)).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400">Users can override per session.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Scan JQL Query</label>
              <textarea
                value={settings.scanJql}
                onChange={(e) => setSettings({ ...settings, scanJql: e.target.value })}
                rows={2}
                className="w-full text-sm font-mono border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                placeholder='reporter = currentUser() AND labels = "readyForTicketCraftRefinement"'
              />
              <p className="text-[11px] text-gray-400">
                Full JQL query for the ticket scanner. Use <code className="bg-gray-100 px-1 rounded">currentUser()</code> for the logged-in user.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">MCP Integration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">GitHub MCP URL</label>
                  <input
                    type="url"
                    value={settings.githubMcpUrl}
                    onChange={(e) => setSettings({ ...settings, githubMcpUrl: e.target.value })}
                    placeholder="http://localhost:3100/mcp"
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">GitLab MCP URL</label>
                  <input
                    type="url"
                    value={settings.gitlabMcpUrl}
                    onChange={(e) => setSettings({ ...settings, gitlabMcpUrl: e.target.value })}
                    placeholder="http://localhost:3200/mcp"
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Max Agentic Rounds</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.mcpMaxRounds}
                    onChange={(e) => setSettings({ ...settings, mcpMaxRounds: parseInt(e.target.value, 10) || 5 })}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-gray-400">How many LLM-to-MCP rounds per ticket (default 5).</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Max Tool Calls</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.mcpMaxToolCalls}
                    onChange={(e) => setSettings({ ...settings, mcpMaxToolCalls: parseInt(e.target.value, 10) || 10 })}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-gray-400">Total MCP tool calls allowed per ticket (default 10).</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                Leave MCP URLs blank to disable. When set, the AI will use MCP tools to fetch deeper repo context during ticket evaluation.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Cursor Integration</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.cursorEnabled}
                    onChange={(e) => setSettings({ ...settings, cursorEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs text-gray-600">{settings.cursorEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
              {settings.cursorEnabled && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Cursor API Key</label>
                    <input
                      type="password"
                      value={settings.cursorApiKey}
                      onChange={(e) => setSettings({ ...settings, cursorApiKey: e.target.value })}
                      placeholder="cursor_..."
                      className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-gray-400">
                      From <a href="https://cursor.com/dashboard/cloud-agents" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">cursor.com/dashboard</a>. Stored server-side only.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">Cursor Model</label>
                      <input
                        type="text"
                        value={settings.cursorModel}
                        onChange={(e) => setSettings({ ...settings, cursorModel: e.target.value })}
                        placeholder="auto"
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-gray-400">"auto" for server default, or a specific model ID (e.g. claude-4-opus).</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">Max Concurrent Agents</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.cursorMaxConcurrent}
                        onChange={(e) => setSettings({ ...settings, cursorMaxConcurrent: parseInt(e.target.value, 10) || 8 })}
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-gray-400">Concurrent Cursor agents. Falls back to Gemini when full.</p>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400">
                When enabled, "Cursor" appears as an AI engine option. Requires a connected repo. Uses local Cursor installation.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                icon={<Save className="w-3.5 h-3.5" />}
                loading={saving}
                onClick={handleSave}
              >
                Save Settings
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {error && (
                <p role="alert" className="text-xs text-red-600">{error}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
