import type { RepoProvider, RepoInfo, RepoTreeEntry } from 'ticketcraft-shared';
import { AppError } from '../../middleware/errorHandler.js';

export interface ParsedRepoUrl {
  provider: RepoProvider;
  host: string;
  owner: string;
  repo: string;
}

export interface RepoContextData {
  info: RepoInfo;
  tree: RepoTreeEntry[];
  readme: string | null;
}

export class RepoService {
  static isGitLabHost(host: string): boolean {
    const h = host.toLowerCase();
    return h === 'gitlab.com' || h.startsWith('gitlab.') || h.includes('.gitlab.');
  }

  static parseRepoUrl(url: string): ParsedRepoUrl {
    const raw = url.trim();
    if (!raw) {
      throw new AppError(
        400,
        'INVALID_REPO_URL',
        'URL must be a GitHub or GitLab repository (e.g. https://github.com/owner/repo).',
      );
    }

    // Support SSH clone URLs like git@github.com:owner/repo.git
    const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
    if (sshMatch) {
      const host = sshMatch[1].toLowerCase();
      const pathSegments = sshMatch[2].split('/').filter(Boolean);
      if (host === 'github.com') {
        if (pathSegments.length < 2) {
          throw new AppError(400, 'INVALID_REPO_URL', 'GitHub URL must include owner and repo.');
        }
        return { provider: 'github', host, owner: pathSegments[0], repo: pathSegments[1] };
      }
      if (this.isGitLabHost(host)) {
        if (pathSegments.length < 2) {
          throw new AppError(400, 'INVALID_REPO_URL', 'GitLab URL must include namespace and repo.');
        }
        return {
          provider: 'gitlab',
          host,
          owner: pathSegments.slice(0, -1).join('/'),
          repo: pathSegments[pathSegments.length - 1],
        };
      }
      throw new AppError(
        400,
        'INVALID_REPO_URL',
        'URL must be a GitHub or GitLab repository (e.g. https://github.com/owner/repo).',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new AppError(
        400,
        'INVALID_REPO_URL',
        'URL must be a GitHub or GitLab repository (e.g. https://github.com/owner/repo).',
      );
    }

    const host = parsed.hostname.toLowerCase();
    const cleanedPath = parsed.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    const segments = cleanedPath.split('/').filter(Boolean);

    if (host === 'github.com') {
      if (segments.length < 2) {
        throw new AppError(400, 'INVALID_REPO_URL', 'GitHub URL must include owner and repo.');
      }
      return { provider: 'github', host, owner: segments[0], repo: segments[1] };
    }

    if (this.isGitLabHost(host)) {
      let namespaceParts = segments;
      const dashMarker = namespaceParts.indexOf('-');
      if (dashMarker >= 0) {
        namespaceParts = namespaceParts.slice(0, dashMarker);
      }
      if (namespaceParts.length < 2) {
        throw new AppError(400, 'INVALID_REPO_URL', 'GitLab URL must include namespace and repo.');
      }
      return {
        provider: 'gitlab',
        host,
        owner: namespaceParts.slice(0, -1).join('/'),
        repo: namespaceParts[namespaceParts.length - 1],
      };
    }

    throw new AppError(
      400,
      'INVALID_REPO_URL',
      'URL must be a GitHub or GitLab repository (e.g. https://github.com/owner/repo).',
    );
  }

  static async fetchContext(repoUrl: string, authToken?: string): Promise<RepoContextData> {
    const parsed = this.parseRepoUrl(repoUrl);

    if (parsed.provider === 'github') {
      return this.fetchGitHub(parsed.owner, parsed.repo, authToken);
    }
    return this.fetchGitLab(parsed.host, parsed.owner, parsed.repo, authToken);
  }

  private static async fetchGitHub(owner: string, repo: string, authToken?: string): Promise<RepoContextData> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TicketCraft',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!repoRes.ok) {
      const errBody = await repoRes.text().catch(() => '');
      if (repoRes.status === 404) {
        throw new AppError(404, 'REPO_NOT_FOUND', `Repository ${owner}/${repo} not found or is private.`, errBody);
      }
      throw new AppError(502, 'GITHUB_API_ERROR', `GitHub API error: ${repoRes.status}`, errBody);
    }

    const repoData = await repoRes.json() as any;

    const info: RepoInfo = {
      provider: 'github',
      host: 'github.com',
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

  private static gitlabApiBase(host: string): string {
    return `https://${host}/api/v4`;
  }

  private static normalizeGitLabToken(authToken?: string): string | undefined {
    if (!authToken) return undefined;
    let token = authToken.trim();
    token = token.replace(/[\u200B-\u200D\uFEFF]/g, '');
    token = token.replace(/^bearer\s+/i, '');
    token = token.replace(/^private-token:\s*/i, '');
    if (
      (token.startsWith('"') && token.endsWith('"'))
      || (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }
    return token || undefined;
  }

  private static gitlabTokenKindError(token: string): string | null {
    const lower = token.toLowerCase();
    if (lower.startsWith('glft-')) {
      return 'That value is a GitLab feed token (glft-), which only works for RSS/Atom feeds. Create a Personal Access Token (prefix glpat-) at /-/user_settings/personal_access_tokens with the api scope.';
    }
    if (lower.startsWith('glimt-')) {
      return 'That value is a GitLab incoming-email token, not an API token. Create a Personal Access Token (prefix glpat-).';
    }
    if (lower.startsWith('glptt-')) {
      return 'That value is a pipeline trigger token, not an API token. Create a Personal Access Token (prefix glpat-).';
    }
    if (lower.startsWith('glrt-') || lower.startsWith('glrtr-')) {
      return 'That value is a GitLab runner token, not an API token. Create a Personal Access Token (prefix glpat-).';
    }
    if (lower.startsWith('ghp_') || lower.startsWith('gho_') || lower.startsWith('github_pat_')) {
      return 'That looks like a GitHub token. For gitlab.cee.redhat.com you need a GitLab Personal Access Token (prefix glpat-).';
    }
    return null;
  }

  private static gitlabAuthAttempts(token: string): { name: string; headers: Record<string, string> }[] {
    const basicOauth = Buffer.from(`oauth2:${token}`, 'utf8').toString('base64');
    const basicPat = Buffer.from(`pat:${token}`, 'utf8').toString('base64');
    return [
      { name: 'PRIVATE-TOKEN', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json', 'PRIVATE-TOKEN': token } },
      { name: 'JOB-TOKEN', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json', 'JOB-TOKEN': token } },
      { name: 'Basic-oauth2', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json', Authorization: `Basic ${basicOauth}` } },
      { name: 'Basic-pat', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json', Authorization: `Basic ${basicPat}` } },
      { name: 'Bearer', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json', Authorization: `Bearer ${token}` } },
    ];
  }

  private static async gitlabGet(
    url: string,
    token: string | undefined,
    timeoutMs: number,
  ): Promise<{ res: Response; headers: Record<string, string>; attempts: string[] }> {
    const attempts = token
      ? this.gitlabAuthAttempts(token)
      : [{ name: 'anonymous', headers: { 'User-Agent': 'TicketCraft', Accept: 'application/json' } }];

    const attemptLog: string[] = [];
    let lastRes: Response | undefined;
    let lastHeaders: Record<string, string> = attempts[0].headers;

    for (const attempt of attempts) {
      const res = await fetch(url, { headers: attempt.headers, signal: AbortSignal.timeout(timeoutMs) });
      attemptLog.push(`${attempt.name}:${res.status}`);
      lastRes = res;
      lastHeaders = attempt.headers;
      if (res.ok || (res.status !== 401 && res.status !== 403)) {
        return { res, headers: attempt.headers, attempts: attemptLog };
      }
    }

    if (token) {
      const withQuery = new URL(url);
      withQuery.searchParams.set('private_token', token);
      const headers = { 'User-Agent': 'TicketCraft', Accept: 'application/json' };
      const res = await fetch(withQuery.toString(), { headers, signal: AbortSignal.timeout(timeoutMs) });
      attemptLog.push(`query-private_token:${res.status}`);
      return { res, headers, attempts: attemptLog };
    }

    return { res: lastRes!, headers: lastHeaders, attempts: attemptLog };
  }

  private static async fetchGitLab(host: string, owner: string, repo: string, authToken?: string): Promise<RepoContextData> {
    const token = this.normalizeGitLabToken(authToken);
    if (!token && host !== 'gitlab.com') {
      throw new AppError(
        401,
        'REPO_AUTH_FAILED',
        `A GitLab personal access token is required for ${host}. Enter it under GitLab Token, then connect again.`,
      );
    }
    if (token) {
      const kindError = this.gitlabTokenKindError(token);
      if (kindError) {
        throw new AppError(401, 'REPO_AUTH_FAILED', kindError);
      }
    }

    const apiBase = this.gitlabApiBase(host);
    const namespace = `${owner}/${repo}`;

    const { res: userRes, headers, attempts } = await this.gitlabGet(`${apiBase}/user`, token, 15_000);
    if (!userRes.ok) {
      const errBody = await userRes.text().catch(() => '');
      const tokenHint = token
        ? `token length ${token.length}, prefix ${token.slice(0, 6)}…`
        : 'no token';
      throw new AppError(
        401,
        'REPO_AUTH_FAILED',
        `GitLab at ${host} rejected the token when calling /api/v4/user (HTTP ${userRes.status}). Tried ${attempts.join(', ')} (${tokenHint}). The token must be a Personal Access Token from ${host}/-/user_settings/personal_access_tokens with the api scope checked (read_repository alone is not enough).`,
        errBody,
      );
    }

    const project = await this.fetchGitLabProject(apiBase, namespace, repo, token, headers);
    const projectId = String(project.id);

    const info: RepoInfo = {
      provider: 'gitlab',
      host,
      owner,
      repo,
      defaultBranch: project.default_branch || 'main',
      description: project.description || null,
      languages: {},
    };

    const [tree, readme, languages] = await Promise.allSettled([
      this.fetchGitLabTree(apiBase, projectId, info.defaultBranch, headers),
      this.fetchGitLabReadme(apiBase, projectId, info.defaultBranch, headers),
      this.fetchGitLabLanguages(apiBase, projectId, headers),
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

  private static async fetchGitLabProject(
    apiBase: string,
    namespace: string,
    repo: string,
    token: string | undefined,
    _headers: Record<string, string>,
  ): Promise<{ id: number | string; default_branch?: string; description?: string | null }> {
    const encoded = encodeURIComponent(namespace);
    const { res: byPath } = await this.gitlabGet(`${apiBase}/projects/${encoded}`, token, 15_000);
    if (byPath.ok) {
      return await byPath.json() as { id: number; default_branch?: string; description?: string | null };
    }

    const searchUrl = `${apiBase}/projects?search=${encodeURIComponent(repo)}&simple=true&membership=true&per_page=50`;
    const { res: searchRes } = await this.gitlabGet(searchUrl, token, 15_000);
    if (searchRes.ok) {
      const projects = await searchRes.json() as Array<{
        id: number;
        path?: string;
        path_with_namespace?: string;
        default_branch?: string;
        description?: string | null;
      }>;
      const match = projects.find((p) => p.path_with_namespace === namespace)
        || projects.find((p) => p.path === repo);
      if (match) {
        const { res: byId } = await this.gitlabGet(`${apiBase}/projects/${match.id}`, token, 15_000);
        if (byId.ok) {
          return await byId.json() as { id: number; default_branch?: string; description?: string | null };
        }
        return match;
      }
    }

    const errBody = await byPath.text().catch(() => '');
    if (byPath.status === 401 || byPath.status === 403 || searchRes.status === 401 || searchRes.status === 403) {
      throw new AppError(
        401,
        'REPO_AUTH_FAILED',
        `GitLab accepted the token but could not open ${namespace} (HTTP ${byPath.status}). Confirm the token has api/read_api access to that project.`,
        errBody,
      );
    }
    if (byPath.status === 404 || searchRes.ok) {
      throw new AppError(404, 'REPO_NOT_FOUND', `Repository ${namespace} not found or is private.`, errBody);
    }
    throw new AppError(502, 'GITLAB_API_ERROR', `GitLab API error: ${byPath.status}`, errBody);
  }

  private static async fetchGitLabTree(apiBase: string, projectId: string, branch: string, headers: Record<string, string>): Promise<RepoTreeEntry[]> {
    const entries: RepoTreeEntry[] = [];
    let page = 1;
    const perPage = 100;

    while (page <= 10) {
      const res = await fetch(
        `${apiBase}/projects/${projectId}/repository/tree?ref=${branch}&recursive=true&per_page=${perPage}&page=${page}`,
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

  private static async fetchGitLabReadme(apiBase: string, projectId: string, branch: string, headers: Record<string, string>): Promise<string | null> {
    const res = await fetch(
      `${apiBase}/projects/${projectId}/repository/files/README.md/raw?ref=${branch}`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 15_000 ? text.slice(0, 15_000) + '\n\n[... truncated ...]' : text;
  }

  private static async fetchGitLabLanguages(apiBase: string, projectId: string, headers: Record<string, string>): Promise<Record<string, number>> {
    const res = await fetch(
      `${apiBase}/projects/${projectId}/languages`,
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

    parts.push(`Repository: ${ctx.info.host}/${ctx.info.owner}/${ctx.info.repo} (${ctx.info.provider})`);

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
