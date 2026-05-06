import type { RepoProvider, RepoInfo, RepoTreeEntry } from 'ticketcraft-shared';
import { AppError } from '../../middleware/errorHandler.js';

interface ParsedRepoUrl {
  provider: RepoProvider;
  owner: string;
  repo: string;
}

export interface RepoContextData {
  info: RepoInfo;
  tree: RepoTreeEntry[];
  readme: string | null;
}

export class RepoService {
  static parseRepoUrl(url: string): ParsedRepoUrl {
    const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');

    const ghMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (ghMatch) {
      return { provider: 'github', owner: ghMatch[1], repo: ghMatch[2] };
    }

    const glMatch = cleaned.match(/gitlab\.com\/([^/]+)\/([^/]+)/);
    if (glMatch) {
      return { provider: 'gitlab', owner: glMatch[1], repo: glMatch[2] };
    }

    throw new AppError(400, 'INVALID_REPO_URL', 'URL must be a GitHub or GitLab repository (e.g. https://github.com/owner/repo).');
  }

  static async fetchContext(repoUrl: string): Promise<RepoContextData> {
    const parsed = this.parseRepoUrl(repoUrl);

    if (parsed.provider === 'github') {
      return this.fetchGitHub(parsed.owner, parsed.repo);
    }
    return this.fetchGitLab(parsed.owner, parsed.repo);
  }

  private static async fetchGitHub(owner: string, repo: string): Promise<RepoContextData> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TicketCraft',
    };

    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        throw new AppError(404, 'REPO_NOT_FOUND', `Repository ${owner}/${repo} not found or is private.`);
      }
      throw new AppError(502, 'GITHUB_API_ERROR', `GitHub API error: ${repoRes.status}`);
    }

    const repoData = await repoRes.json() as any;

    const info: RepoInfo = {
      provider: 'github',
      owner,
      repo,
      defaultBranch: repoData.default_branch || 'main',
      description: repoData.description || null,
      languages: {},
    };

    const [tree, readme, languages] = await Promise.allSettled([
      this.fetchGitHubTree(owner, repo, info.defaultBranch, headers),
      this.fetchGitHubReadme(owner, repo, headers),
      this.fetchGitHubLanguages(owner, repo, headers),
    ]);

    if (languages.status === 'fulfilled') {
      info.languages = languages.value;
    }

    return {
      info,
      tree: tree.status === 'fulfilled' ? tree.value : [],
      readme: readme.status === 'fulfilled' ? readme.value : null,
    };
  }

  private static async fetchGitHubTree(owner: string, repo: string, branch: string, headers: Record<string, string>): Promise<RepoTreeEntry[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];

    const data = await res.json() as any;
    return (data.tree || [])
      .filter((e: any) => e.type === 'blob' || e.type === 'tree')
      .map((e: any) => ({ path: e.path, type: e.type as 'blob' | 'tree' }));
  }

  private static async fetchGitHubReadme(owner: string, repo: string, headers: Record<string, string>): Promise<string | null> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers: { ...headers, Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 15_000 ? text.slice(0, 15_000) + '\n\n[... truncated ...]' : text;
  }

  private static async fetchGitHubLanguages(owner: string, repo: string, headers: Record<string, string>): Promise<Record<string, number>> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/languages`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return {};
    return await res.json() as Record<string, number>;
  }

  private static async fetchGitLab(owner: string, repo: string): Promise<RepoContextData> {
    const projectId = encodeURIComponent(`${owner}/${repo}`);
    const headers: Record<string, string> = { 'User-Agent': 'TicketCraft' };

    const repoRes = await fetch(`https://gitlab.com/api/v4/projects/${projectId}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        throw new AppError(404, 'REPO_NOT_FOUND', `Repository ${owner}/${repo} not found or is private.`);
      }
      throw new AppError(502, 'GITLAB_API_ERROR', `GitLab API error: ${repoRes.status}`);
    }

    const repoData = await repoRes.json() as any;

    const info: RepoInfo = {
      provider: 'gitlab',
      owner,
      repo,
      defaultBranch: repoData.default_branch || 'main',
      description: repoData.description || null,
      languages: {},
    };

    const [tree, readme, languages] = await Promise.allSettled([
      this.fetchGitLabTree(projectId, info.defaultBranch, headers),
      this.fetchGitLabReadme(projectId, info.defaultBranch, headers),
      this.fetchGitLabLanguages(projectId, headers),
    ]);

    if (languages.status === 'fulfilled') {
      info.languages = languages.value;
    }

    return {
      info,
      tree: tree.status === 'fulfilled' ? tree.value : [],
      readme: readme.status === 'fulfilled' ? readme.value : null,
    };
  }

  private static async fetchGitLabTree(projectId: string, branch: string, headers: Record<string, string>): Promise<RepoTreeEntry[]> {
    const entries: RepoTreeEntry[] = [];
    let page = 1;
    const perPage = 100;

    while (page <= 10) {
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/repository/tree?ref=${branch}&recursive=true&per_page=${perPage}&page=${page}`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) break;

      const data = await res.json() as any[];
      if (data.length === 0) break;

      for (const e of data) {
        entries.push({ path: e.path, type: e.type === 'tree' ? 'tree' : 'blob' });
      }

      if (data.length < perPage) break;
      page++;
    }

    return entries;
  }

  private static async fetchGitLabReadme(projectId: string, branch: string, headers: Record<string, string>): Promise<string | null> {
    const res = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/repository/files/README.md/raw?ref=${branch}`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 15_000 ? text.slice(0, 15_000) + '\n\n[... truncated ...]' : text;
  }

  private static async fetchGitLabLanguages(projectId: string, headers: Record<string, string>): Promise<Record<string, number>> {
    const res = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/languages`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return {};
    return await res.json() as Record<string, number>;
  }

  static formatTreeForPrompt(tree: RepoTreeEntry[], maxEntries = 200): string {
    const dirs = tree.filter((e) => e.type === 'tree').map((e) => e.path + '/');
    const files = tree.filter((e) => e.type === 'blob').map((e) => e.path);

    const relevantExts = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb',
      '.cs', '.kt', '.swift', '.vue', '.svelte', '.astro',
      '.json', '.yaml', '.yml', '.toml', '.md',
    ]);

    const filteredFiles = files.filter((f) => {
      if (f.includes('node_modules/') || f.includes('.git/') || f.includes('dist/') || f.includes('build/')) return false;
      const ext = f.slice(f.lastIndexOf('.'));
      return relevantExts.has(ext);
    });

    const combined = [...dirs.slice(0, 50), ...filteredFiles.slice(0, maxEntries - 50)];
    return combined.join('\n');
  }

  static formatContextForPrompt(ctx: RepoContextData): string {
    const parts: string[] = [];

    parts.push(`Repository: ${ctx.info.owner}/${ctx.info.repo} (${ctx.info.provider})`);

    if (ctx.info.description) {
      parts.push(`Description: ${ctx.info.description}`);
    }

    if (Object.keys(ctx.info.languages).length > 0) {
      const total = Object.values(ctx.info.languages).reduce((a, b) => a + b, 0);
      const langs = Object.entries(ctx.info.languages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([lang, bytes]) => `${lang} (${Math.round((bytes / total) * 100)}%)`)
        .join(', ');
      parts.push(`Languages: ${langs}`);
    }

    if (ctx.tree.length > 0) {
      parts.push(`\nProject structure:\n${this.formatTreeForPrompt(ctx.tree)}`);
    }

    if (ctx.readme) {
      const readmePreview = ctx.readme.length > 3000 ? ctx.readme.slice(0, 3000) + '\n[... truncated ...]' : ctx.readme;
      parts.push(`\nREADME:\n${readmePreview}`);
    }

    return parts.join('\n');
  }
}
