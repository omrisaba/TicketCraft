import { useState, useRef } from 'react';
import type { ReferenceLink } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import {
  Link, Plus, Trash2, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, Upload, FileText,
} from 'lucide-react';
import { api } from '../../services/apiClient';

interface ReferenceLinksProps {
  links: ReferenceLink[];
  onChange: (links: ReferenceLink[]) => void;
  disabled?: boolean;
}

export function ReferenceLinks({ links, onChange, disabled }: ReferenceLinksProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const addLink = async () => {
    const url = inputUrl.trim();
    if (!url || !isValidUrl(url)) return;
    if (links.some((l) => l.url === url)) return;

    const placeholder: ReferenceLink = { url, label: extractLabel(url), fetched: false };
    const updated = [...links, placeholder];
    onChange(updated);
    setInputUrl('');
    setFetching(true);

    try {
      const result = await api.repo.fetchUrls([url]) as ReferenceLink[];
      const fetched = result[0];
      onChange(updated.map((l) => (l.url === url ? fetched : l)));
    } catch {
      onChange(updated.map((l) =>
        l.url === url ? { ...l, error: 'Failed to fetch', fetched: false } : l,
      ));
    } finally {
      setFetching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const placeholders: ReferenceLink[] = fileArray.map((f) => ({
      url: `file://${f.name}`,
      label: f.name,
      fetched: false,
    }));

    const updated = [...links, ...placeholders];
    onChange(updated);
    setUploading(true);

    try {
      const results = await api.repo.uploadFiles(fileArray) as ReferenceLink[];
      onChange([
        ...links,
        ...results,
      ]);
    } catch {
      onChange([
        ...links,
        ...placeholders.map((p) => ({ ...p, error: 'Upload failed', fetched: false })),
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLink = (url: string) => {
    onChange(links.filter((l) => l.url !== url));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLink();
    }
  };

  const isFile = (url: string) => url.startsWith('file://');
  const busy = fetching || uploading;

  return (
    <Card padding="sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-800">Reference Files</h4>
          {links.length > 0 && (
            <Badge variant="default" size="sm">{links.length}</Badge>
          )}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Add files or public URLs to give the AI more context for this ticket.
        </p>

        {!disabled && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="url"
                aria-label="Reference file URL"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste public URL..."
                className="flex-1 text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={busy}
              />
              <button
                onClick={addLink}
                disabled={busy || !inputUrl.trim() || !isValidUrl(inputUrl.trim())}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {fetching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Add
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] text-gray-400 uppercase">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.yaml,.yml,.csv,.html,.xml,.log,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.rb,.cs,.kt,.swift,.vue,.svelte,.toml,.cfg,.ini,.sql,.sh,.bash,.zsh,.dockerfile"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Upload files
            </button>
          </div>
        )}

        {links.length > 0 && (
          <div className="space-y-1.5">
            {links.map((link) => (
              <div
                key={link.url}
                className="flex items-center gap-2 bg-gray-50 rounded-md px-2.5 py-1.5 group"
              >
                {link.fetched ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : link.error ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isFile(link.url) ? (
                      <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                    ) : null}
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {link.label}
                    </span>
                    {!isFile(link.url) && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {link.error && (
                    <span className="text-[10px] text-red-400">{link.error}</span>
                  )}
                  {link.fetched && link.content && (
                    <span className="text-[10px] text-green-600">
                      {Math.round(link.content.length / 1000)}KB loaded
                    </span>
                  )}
                </div>

                {!disabled && (
                  <button
                    onClick={() => removeLink(link.url)}
                    aria-label={`Remove ${link.label}`}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function extractLabel(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const blobIdx = parts.indexOf('blob');
      if (blobIdx >= 0 && blobIdx + 2 < parts.length) {
        return parts.slice(blobIdx + 2).join('/');
      }
      return parts.slice(-2).join('/');
    }
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}
