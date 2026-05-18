import type {
  ApiResponse,
  SessionCredentials,
  ImproveRequest,
  ImproveResponse,
  RefineRequest,
  RefineResponse,
  ComposeRequest,
  BreakdownRequest,
  BreakdownResponse,
  BatchCreateRequest,
  BatchCreateResponse,
  JiraProject,
  JiraIssueType,
  JiraUser,
} from 'ticketcraft-shared';

let currentCredentials: SessionCredentials | null = null;

export function setApiCredentials(creds: SessionCredentials) {
  currentCredentials = creds;
}

export function clearApiCredentials() {
  currentCredentials = null;
}

export function updateApiModel(model: string) {
  if (currentCredentials) {
    currentCredentials = { ...currentCredentials, geminiModel: model as any };
  }
}

let currentTemperature = 0.3;

export function updateApiTemperature(temp: number) {
  currentTemperature = temp;
}

const LONG_RUNNING_PATHS = ['/api/ai/improve', '/api/ai/refine', '/api/ai/enrich'];
const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 600_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (currentCredentials) {
    headers['X-Jira-Email'] = currentCredentials.jiraEmail;
    headers['X-Jira-Token'] = currentCredentials.jiraApiToken;
    headers['X-Gemini-Model'] = currentCredentials.geminiModel;
    headers['X-Gemini-Temperature'] = String(currentTemperature);
    if (currentCredentials.githubToken) headers['X-Github-Token'] = currentCredentials.githubToken;
    if (currentCredentials.gitlabToken) headers['X-Gitlab-Token'] = currentCredentials.gitlabToken;
    if (currentCredentials.cursorApiKey) headers['X-Cursor-Api-Key'] = currentCredentials.cursorApiKey;
  }

  const timeoutMs = LONG_RUNNING_PATHS.some((p) => path.startsWith(p))
    ? LONG_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data: ApiResponse<T> = await response.json();

    if (!data.success || data.error) {
      throw new ApiClientError(
        data.error?.message || 'Unknown error',
        data.error?.code || 'UNKNOWN',
        response.status,
      );
    }

    return data.data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiClientError(
        'Request timed out. The operation is taking longer than expected — please try again.',
        'TIMEOUT',
        408,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export const api = {
  session: {
    getConfig: () => request('/api/session/config'),
    validate: (body: {
      geminiModel: string;
      jiraEmail: string;
      jiraApiToken: string;
    }) => request('/api/session/validate', { method: 'POST', body: JSON.stringify(body) }),
  },

  jira: {
    getTicket: (key: string) => request(`/api/jira/ticket/${key}`),
    getLinkedTickets: (key: string) => request(`/api/jira/ticket/${key}/linked`),
    updateTicket: (key: string, changes: unknown) =>
      request(`/api/jira/ticket/${key}`, { method: 'PUT', body: JSON.stringify(changes) }),
    uploadAttachment: (key: string, data: unknown) =>
      request(`/api/jira/ticket/${key}/attach`, { method: 'POST', body: JSON.stringify(data) }),
    createTicket: (body: {
      projectKey: string;
      issueType: string;
      changes: unknown;
      parentKey?: string;
      linkToOriginal?: boolean;
      originalKey?: string;
      assigneeAccountId?: string;
    }) => request<{ key: string; id: string }>('/api/jira/ticket', { method: 'POST', body: JSON.stringify(body) }),
    getProjects: (query?: string) => {
      const q = query ? `?query=${encodeURIComponent(query)}` : '';
      return request<JiraProject[]>(`/api/jira/projects${q}`);
    },
    getIssueTypes: (projectKey: string) =>
      request<JiraIssueType[]>(`/api/jira/projects/${projectKey}/issuetypes`),
    getAssignableUsers: (projectKey: string, query?: string) => {
      const q = query ? `?query=${encodeURIComponent(query)}` : '';
      return request<JiraUser[]>(`/api/jira/projects/${projectKey}/assignable-users${q}`);
    },
    batchCreateTickets: (body: BatchCreateRequest) =>
      request<BatchCreateResponse>('/api/jira/ticket/batch', { method: 'POST', body: JSON.stringify(body) }),
  },

  ai: {
    score: (body: unknown) =>
      request('/api/ai/score', { method: 'POST', body: JSON.stringify(body) }),
    improve: (body: ImproveRequest) =>
      request<ImproveResponse>('/api/ai/improve', { method: 'POST', body: JSON.stringify(body) }),
    questions: (body: unknown) =>
      request('/api/ai/questions', { method: 'POST', body: JSON.stringify(body) }),
    enrich: (body: ImproveRequest) =>
      request<ImproveResponse>('/api/ai/enrich', { method: 'POST', body: JSON.stringify(body) }),
    compose: (body: ComposeRequest) =>
      request<ImproveResponse>('/api/ai/compose', { method: 'POST', body: JSON.stringify(body) }),
    breakdown: (body: BreakdownRequest) =>
      request<BreakdownResponse>('/api/ai/breakdown', { method: 'POST', body: JSON.stringify(body) }),
    annotate: (body: unknown) =>
      request('/api/ai/annotate', { method: 'POST', body: JSON.stringify(body) }),
    refine: (body: RefineRequest) =>
      request<RefineResponse>('/api/ai/refine', { method: 'POST', body: JSON.stringify(body) }),
    repoUsage: (body: unknown) =>
      request('/api/ai/repo-usage', { method: 'POST', body: JSON.stringify(body) }),
    document: (body: unknown) =>
      request('/api/ai/document', { method: 'POST', body: JSON.stringify(body) }),
  },

  repo: {
    fetchContext: (repoUrl: string) =>
      request('/api/repo/context', { method: 'POST', body: JSON.stringify({ repoUrl }) }),
    fetchUrls: (urls: string[]) =>
      request('/api/repo/fetch-urls', { method: 'POST', body: JSON.stringify({ urls }) }),
    uploadFiles: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const headers: Record<string, string> = {};
      if (currentCredentials) {
        headers['X-Jira-Email'] = currentCredentials.jiraEmail;
        headers['X-Jira-Token'] = currentCredentials.jiraApiToken;
        headers['X-Gemini-Model'] = currentCredentials.geminiModel;
        headers['X-Gemini-Temperature'] = String(currentTemperature);
        if (currentCredentials.githubToken) headers['X-Github-Token'] = currentCredentials.githubToken;
        if (currentCredentials.gitlabToken) headers['X-Gitlab-Token'] = currentCredentials.gitlabToken;
        if (currentCredentials.cursorApiKey) headers['X-Cursor-Api-Key'] = currentCredentials.cursorApiKey;
      }
      const response = await fetch('/api/repo/upload-files', {
        method: 'POST',
        headers,
        body: formData,
      });
      const data = await response.json();
      if (!data.success || data.error) {
        throw new ApiClientError(
          data.error?.message || 'Upload failed',
          data.error?.code || 'UNKNOWN',
          response.status,
        );
      }
      return data.data;
    },
  },

  drafts: {
    check: () => request('/api/drafts/check'),
    load: () => request('/api/drafts/load'),
    save: (draft: unknown) =>
      request('/api/drafts/save', { method: 'POST', body: JSON.stringify(draft) }),
    remove: () => request('/api/drafts', { method: 'DELETE' }),
  },

  templates: {
    list: () => request('/api/templates'),
    get: (type: string) => request(`/api/templates/${type}`),
  },

  automation: {
    info: () => request('/api/automation/info'),
    search: (jql: string, excludeProcessed?: boolean) =>
      request('/api/automation/search', {
        method: 'POST',
        body: JSON.stringify({ jql, excludeProcessed }),
      }),
    scan: (ticketKeys: string[], detailLevel?: string) =>
      request('/api/automation/scan', {
        method: 'POST',
        body: JSON.stringify({ ticketKeys, detailLevel }),
      }),
    pending: () => request('/api/automation/pending'),
    loadResult: (ticketKey: string) => request(`/api/automation/result/${ticketKey}`),
    dismiss: (ticketKey: string) => request(`/api/automation/result/${ticketKey}`, { method: 'DELETE' }),
    loadProfile: () => request('/api/automation/profile'),
    saveRepoUrl: (repoUrl: string | null) =>
      request('/api/automation/profile', { method: 'POST', body: JSON.stringify({ repoUrl }) }),
  },

  history: {
    list: () => request('/api/history'),
    load: (id: string) => request(`/api/history/${id}`),
    save: (snapshot: unknown) =>
      request('/api/history', { method: 'POST', body: JSON.stringify(snapshot) }),
    remove: (id: string) => request(`/api/history/${id}`, { method: 'DELETE' }),
    markSynced: (id: string, body?: { syncedAt?: string; finalScore?: { overall: number } }) =>
      request(`/api/history/${id}/synced`, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  },

  admin: {
    loadSettings: () => request('/api/admin/settings'),
    saveSettings: (settings: unknown) =>
      request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    logs: (opts?: { category?: string; limit?: number; date?: string }) => {
      const p = new URLSearchParams();
      if (opts?.category) p.set('category', opts.category);
      if (opts?.limit != null) p.set('limit', String(opts.limit));
      if (opts?.date) p.set('date', opts.date);
      const q = p.toString();
      return request(`/api/admin/logs${q ? `?${q}` : ''}`);
    },
    clearLogs: () => request('/api/admin/logs', { method: 'DELETE' }),
    cursorModels: () => request('/api/admin/cursor-models'),
    usage: () => request('/api/admin/usage'),
  },

  export: {
    pdf: (body: unknown) =>
      request('/api/export/pdf', { method: 'POST', body: JSON.stringify(body) }),
    markdown: (body: unknown) =>
      request('/api/export/markdown', { method: 'POST', body: JSON.stringify(body) }),
  },
};
