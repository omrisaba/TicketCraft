import type { Request, Response, NextFunction } from 'express';
import type { ReferenceLink } from 'ticketcraft-shared';
import multer from 'multer';
import { getCredentials } from '../types/index.js';
import { RepoService } from '../services/repo/RepoService.js';
import { AppError } from '../middleware/errorHandler.js';

const MAX_FILE_SIZE = 80_000;
const MAX_URLS = 10;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB per file
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.csv',
  '.html', '.xml', '.log', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.java', '.go', '.rs', '.rb', '.cs', '.kt',
  '.swift', '.vue', '.svelte', '.toml', '.cfg', '.ini',
  '.sql', '.sh', '.bash', '.zsh', '.dockerfile',
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = '.' + (file.originalname.split('.').pop()?.toLowerCase() || '');
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'UNSUPPORTED_FILE', `File type ${ext} is not supported. Upload text-based files only.`));
    }
  },
});

const ALLOWED_FETCH_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org',
]);

export class RepoController {
  fetchContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { repoUrl } = req.body;

      if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
        throw new AppError(400, 'INVALID_REPO_URL', 'A repository URL is required.');
      }

      const parsed = RepoService.parseRepoUrl(repoUrl.trim());
      const creds = getCredentials(req);
      const authToken =
        parsed.provider === 'github' ? creds.githubToken : creds.gitlabToken;
      const context = await RepoService.fetchContext(repoUrl.trim(), authToken);
      const promptContext = RepoService.formatContextForPrompt(context);

      res.json({ success: true, data: { ...context, promptContext } });
    } catch (err) {
      next(err);
    }
  };

  fetchUrls = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { urls } = req.body as { urls: string[] };

      if (!Array.isArray(urls) || urls.length === 0) {
        throw new AppError(400, 'INVALID_URLS', 'An array of URLs is required.');
      }

      const toFetch = urls.slice(0, MAX_URLS);
      const results: ReferenceLink[] = await Promise.all(
        toFetch.map((url) => this.fetchSingleUrl(url)),
      );

      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  };

  uploadFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new AppError(400, 'NO_FILES', 'At least one file is required.');
      }

      const results: ReferenceLink[] = files.map((file) => {
        let content = file.buffer.toString('utf-8');
        if (content.length > MAX_FILE_SIZE) {
          content = content.slice(0, MAX_FILE_SIZE) + '\n\n[... truncated at 80KB ...]';
        }
        return {
          url: `file://${file.originalname}`,
          label: file.originalname,
          content,
          fetched: true,
        };
      });

      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  };

  private validateFetchUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError(400, 'INVALID_URL', 'URL is not valid.');
    }
    if (parsed.protocol !== 'https:') {
      throw new AppError(400, 'INVALID_URL', 'Only HTTPS URLs are allowed.');
    }
    if (!ALLOWED_FETCH_HOSTS.has(parsed.hostname)) {
      throw new AppError(
        400,
        'BLOCKED_HOST',
        `Host "${parsed.hostname}" is not in the allowed list.`,
      );
    }
  }

  private async fetchSingleUrl(url: string): Promise<ReferenceLink> {
    const label = this.extractLabel(url);
    try {
      const rawUrl = this.toRawUrl(url);
      this.validateFetchUrl(rawUrl);

      const res = await fetch(rawUrl, {
        headers: { 'User-Agent': 'TicketCraft' },
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });

      if (!res.ok) {
        return { url, label, fetched: false, error: `HTTP ${res.status}` };
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('image') || contentType.includes('octet-stream')) {
        return { url, label, fetched: false, error: 'Binary file — cannot extract text' };
      }

      let text = await res.text();
      if (text.length > MAX_FILE_SIZE) {
        text = text.slice(0, MAX_FILE_SIZE) + '\n\n[... truncated at 80KB ...]';
      }

      return { url, label, content: text, fetched: true };
    } catch (err: any) {
      return { url, label, fetched: false, error: err.message || 'Failed to fetch' };
    }
  }

  private toRawUrl(url: string): string {
    const ghBlobMatch = url.match(
      /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    );
    if (ghBlobMatch) {
      return `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}/${ghBlobMatch[4]}`;
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (
      parsed
      && parsed.hostname.toLowerCase() === 'gitlab.com'
      && parsed.pathname.includes('/-/blob/')
    ) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const dashIdx = parts.indexOf('-');
      const blobIdx = parts.indexOf('blob');
      if (dashIdx >= 0 && blobIdx === dashIdx + 1 && blobIdx + 2 < parts.length) {
        const namespace = parts.slice(0, dashIdx).join('/');
        const ref = parts[blobIdx + 1];
        const filePathRaw = parts.slice(blobIdx + 2).join('/');
        const projectId = encodeURIComponent(namespace);
        const filePath = encodeURIComponent(filePathRaw);
        return `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${filePath}/raw?ref=${ref}`;
      }
    }

    return url;
  }

  private extractLabel(url: string): string {
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
}
