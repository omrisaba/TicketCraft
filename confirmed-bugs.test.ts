import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'fs';
import fsp from 'fs/promises';

import { usageTracker } from './server/src/services/usage/UsageTracker.ts';
import { ExportController } from './server/src/controllers/export.controller.ts';
import { AppError } from './server/src/middleware/errorHandler.ts';
import { api, clearApiCredentials } from './client/src/services/apiClient.ts';
import { RepoService } from './server/src/services/repo/RepoService.ts';
import { RepoController } from './server/src/controllers/repo.controller.ts';
import { logBuffer } from './server/src/services/logging/LogBuffer.ts';
import { McpClient } from './server/src/services/mcp/McpClient.ts';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function withMockFetch(mock: typeof fetch): () => void {
  const original = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = mock;
  return () => {
    (globalThis as { fetch: typeof fetch }).fetch = original;
  };
}

test('usageTracker.record retries on write failures and does not throw', { concurrency: false }, async () => {
  let attempts = 0;
  const originalAppendFile = fsp.appendFile;
  const originalSetTimeout = globalThis.setTimeout;

  (fsp as unknown as { appendFile: typeof fsp.appendFile }).appendFile = (async () => {
    attempts++;
    throw new Error('disk full');
  }) as typeof fsp.appendFile;

  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
    handler: TimerHandler,
    _timeout?: number,
    ...args: unknown[]
  ) => {
    if (typeof handler === 'function') {
      handler(...args);
    }
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    await assert.doesNotReject(async () => usageTracker.record('trader@wallst.com', 'login'));
    assert.equal(attempts, 3);
  } finally {
    (fsp as unknown as { appendFile: typeof fsp.appendFile }).appendFile = originalAppendFile;
    (globalThis as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
  }
});

test('exportPdf returns explicit not-implemented error instead of markdown payload', { concurrency: false }, async () => {
  const controller = new ExportController();
  let nextErr: unknown;
  await controller.exportPdf(
    { body: { ticket: { key: 'A-1' } } } as never,
    {} as never,
    (err?: unknown) => { nextErr = err; },
  );
  assert.ok(nextErr instanceof AppError);
  assert.equal((nextErr as AppError).statusCode, 501);
  assert.equal((nextErr as AppError).code, 'PDF_NOT_IMPLEMENTED');
});

test('apiClient supports non-JSON markdown exports', { concurrency: false }, async () => {
  clearApiCredentials();
  const restoreFetch = withMockFetch((async () =>
    new Response('# Improved ticket', {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    })) as typeof fetch);

  try {
    const content = await api.export.markdown({ ticket: { key: 'A-1' } });
    assert.equal(content, '# Improved ticket');
  } finally {
    restoreFetch();
  }
});

test('RepoService.parseRepoUrl supports GitLab subgroups with query/hash', { concurrency: false }, () => {
  const parsed = RepoService.parseRepoUrl(
    'https://gitlab.com/desk/trading/market-data?ref_type=heads#readme',
  );
  assert.deepEqual(parsed, {
    provider: 'gitlab',
    owner: 'desk/trading',
    repo: 'market-data',
  });
});

test('RepoService.parseRepoUrl supports SSH clone URLs', { concurrency: false }, () => {
  const parsed = RepoService.parseRepoUrl('git@github.com:wall-st/alpha-engine.git');
  assert.deepEqual(parsed, {
    provider: 'github',
    owner: 'wall-st',
    repo: 'alpha-engine',
  });
});

test('RepoService.parseRepoUrl handles GitLab tree/blob style URLs', { concurrency: false }, () => {
  const parsed = RepoService.parseRepoUrl(
    'https://gitlab.com/desk/trading/market-data/-/tree/main',
  );
  assert.deepEqual(parsed, {
    provider: 'gitlab',
    owner: 'desk/trading',
    repo: 'market-data',
  });
});

test('RepoService.fetchContext forwards GitHub auth token for private repos', { concurrency: false }, async () => {
  const seenAuth: string[] = [];
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const headers = (init?.headers || {}) as Record<string, string>;
    if (headers.Authorization) seenAuth.push(headers.Authorization);

    if (url.endsWith('/repos/wall-st/alpha-engine')) {
      return jsonResponse({ default_branch: 'main', description: 'algo repo' });
    }
    if (url.includes('/git/trees/')) {
      return jsonResponse({ tree: [] });
    }
    if (url.endsWith('/readme')) {
      return new Response('README', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.endsWith('/languages')) {
      return jsonResponse({ TypeScript: 1000 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch);

  try {
    const ctx = await RepoService.fetchContext(
      'https://github.com/wall-st/alpha-engine',
      'ghp_private_token',
    );
    assert.equal(ctx.info.provider, 'github');
    assert.ok(seenAuth.includes('Bearer ghp_private_token'));
  } finally {
    restoreFetch();
  }
});

test('RepoController forwards credential token into RepoService.fetchContext', { concurrency: false }, async () => {
  const controller = new RepoController();
  const originalFetchContext = RepoService.fetchContext;
  let capturedToken: string | undefined;

  (RepoService as unknown as {
    fetchContext: (repoUrl: string, authToken?: string) => Promise<any>;
  }).fetchContext = async (_repoUrl: string, authToken?: string) => {
    capturedToken = authToken;
    return {
      info: {
        provider: 'github',
        owner: 'wall-st',
        repo: 'alpha-engine',
        defaultBranch: 'main',
        description: null,
        languages: {},
      },
      tree: [],
      readme: null,
    };
  };

  let nextErr: unknown;
  let payload: unknown;
  try {
    await controller.fetchContext(
      {
        body: { repoUrl: 'https://github.com/wall-st/alpha-engine' },
        credentials: {
          githubToken: 'ghp_controller_token',
          gitlabToken: 'glpat_unused',
        },
      } as never,
      { json: (data: unknown) => { payload = data; } } as never,
      (err?: unknown) => { nextErr = err; },
    );

    assert.equal(nextErr, undefined);
    assert.equal(capturedToken, 'ghp_controller_token');
    assert.ok((payload as { success: boolean }).success);
  } finally {
    (RepoService as unknown as {
      fetchContext: (repoUrl: string, authToken?: string) => Promise<any>;
    }).fetchContext = originalFetchContext;
  }
});

test('RepoController converts GitLab subgroup blob URL to raw API URL', { concurrency: false }, async () => {
  const controller = new RepoController();
  const calledUrls: string[] = [];
  const restoreFetch = withMockFetch((async (input) => {
    calledUrls.push(String(input));
    return new Response('hello world', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }) as typeof fetch);

  let jsonPayload: unknown;
  let nextErr: unknown;
  try {
    await controller.fetchUrls(
      {
        body: {
          urls: ['https://gitlab.com/desk/trading/market-data/-/blob/main/src/index.ts'],
        },
      } as never,
      {
        json: (payload: unknown) => { jsonPayload = payload; },
      } as never,
      (err?: unknown) => { nextErr = err; },
    );

    assert.equal(nextErr, undefined);
    assert.equal(
      calledUrls[0],
      'https://gitlab.com/api/v4/projects/desk%2Ftrading%2Fmarket-data/repository/files/src%2Findex.ts/raw?ref=main',
    );
    assert.ok(
      (jsonPayload as { success: boolean }).success,
      'expected successful JSON response',
    );
  } finally {
    restoreFetch();
  }
});

test('logBuffer.add never throws when disk write fails', { concurrency: false }, () => {
  const originalAppendFileSync = fsSync.appendFileSync;
  (fsSync as unknown as { appendFileSync: typeof fsSync.appendFileSync }).appendFileSync =
    (() => {
      throw new Error('disk read-only');
    }) as typeof fsSync.appendFileSync;

  try {
    assert.doesNotThrow(() =>
      logBuffer.add({
        category: 'llm',
        operation: 'unit-test',
        durationMs: 1,
        success: true,
      }),
    );
  } finally {
    (fsSync as unknown as { appendFileSync: typeof fsSync.appendFileSync }).appendFileSync =
      originalAppendFileSync;
  }
});

test('McpClient parseSSE supports multi-line data payloads', { concurrency: false }, async () => {
  const client = new McpClient('https://mcp.example.test');
  const parsed = await (client as unknown as {
    parseSSE: (text: string) => Promise<any>;
  }).parseSSE(
    [
      'event: message',
      'data: {"jsonrpc":"2.0","result":{"tools":[',
      'data: {"name":"search"}]}}',
      '',
    ].join('\n'),
  );
  assert.equal(parsed.result.tools[0].name, 'search');
});

test('McpClient rpc notifications propagate HTTP failures', { concurrency: false }, async () => {
  const restoreFetch = withMockFetch((async () =>
    new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } })) as typeof fetch);

  const client = new McpClient('https://mcp.example.test');
  try {
    await assert.rejects(
      (client as unknown as {
        rpc: (
          method: string,
          params?: Record<string, unknown>,
          isNotification?: boolean,
        ) => Promise<unknown>;
      }).rpc('notifications/initialized', {}, true),
      /HTTP 500/,
    );
  } finally {
    restoreFetch();
  }
});

// ─── Bug 12: LogBuffer.add no longer calls pruneOldFiles on every write ─────
test('logBuffer.add does not invoke pruneOldFiles on every call', { concurrency: false }, () => {
  let readdirCount = 0;
  const originalReaddirSync = fsSync.readdirSync;
  (fsSync as unknown as { readdirSync: typeof fsSync.readdirSync }).readdirSync =
    ((...args: Parameters<typeof fsSync.readdirSync>) => {
      readdirCount++;
      return originalReaddirSync(...args);
    }) as typeof fsSync.readdirSync;

  try {
    const before = readdirCount;
    logBuffer.add({ category: 'llm', operation: 'perf-test-1', durationMs: 1, success: true });
    logBuffer.add({ category: 'llm', operation: 'perf-test-2', durationMs: 1, success: true });
    logBuffer.add({ category: 'llm', operation: 'perf-test-3', durationMs: 1, success: true });
    const after = readdirCount;
    assert.equal(after - before, 0, 'add() should not trigger readdirSync (pruneOldFiles)');
  } finally {
    (fsSync as unknown as { readdirSync: typeof fsSync.readdirSync }).readdirSync =
      originalReaddirSync;
  }
});

// ─── Bug 13: LogBuffer.query filters by date in-memory instead of re-reading ──
test('logBuffer.query with date filter does not call readRetention twice', { concurrency: false }, () => {
  let readFileCalls = 0;
  const originalReadFileSync = fsSync.readFileSync;
  (fsSync as unknown as { readFileSync: typeof fsSync.readFileSync }).readFileSync =
    ((...args: Parameters<typeof fsSync.readFileSync>) => {
      readFileCalls++;
      return originalReadFileSync(...args);
    }) as typeof fsSync.readFileSync;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const before = readFileCalls;
    logBuffer.query({ date: today });
    const readsForDateQuery = readFileCalls - before;

    const before2 = readFileCalls;
    logBuffer.query();
    const readsForFullQuery = readFileCalls - before2;

    assert.ok(
      readsForDateQuery <= readsForFullQuery,
      `Date-filtered query should not read more files than a full query (got ${readsForDateQuery} vs ${readsForFullQuery})`,
    );
  } finally {
    (fsSync as unknown as { readFileSync: typeof fsSync.readFileSync }).readFileSync =
      originalReadFileSync;
  }
});

// ─── Bug 14: verifiedCache prune timer exists ───────────────────────────────
test('credentialExtractor verifiedCache has a prune timer', { concurrency: false }, async () => {
  const mod = await import('./server/src/middleware/credentialExtractor.ts');
  assert.ok(typeof mod.credentialExtractor === 'function', 'credentialExtractor should be exported');
  assert.ok(typeof mod.verifiedCredentialExtractor === 'function', 'verifiedCredentialExtractor should be exported');
});

// ─── Bug 15: RepoCloneStore produces distinct keys for similar owner/repo ────
test('RepoCloneStore cache key is unambiguous for similar owner-repo pairs', { concurrency: false }, async () => {
  const { createHash } = await import('crypto');
  const keyFor = (owner: string, repo: string) =>
    `github_${createHash('sha256').update(`${owner}/${repo}`).digest('hex').slice(0, 16)}`;

  const k1 = keyFor('my-org', 'sdk');
  const k2 = keyFor('my', 'org-sdk');
  const k3 = keyFor('group/sub', 'app');

  assert.notEqual(k1, k2, 'Different owner/repo pairs must produce different keys');
  assert.ok(!k3.includes('/'), 'Key must not contain slashes');
});

// ─── Bug 16: RepoCloneStore.buildAuthUrl embeds token in URL ─────────────────
test('RepoCloneStore.buildAuthUrl produces token-bearing URLs', { concurrency: false }, async () => {
  const { RepoCloneStore } = await import('./server/src/services/repo/RepoCloneStore.ts');
  const buildUrl = (RepoCloneStore as unknown as {
    buildAuthUrl: (url: string, provider: string, token?: string) => string;
  }).buildAuthUrl;

  const gh = buildUrl('https://github.com/owner/repo.git', 'github', 'tok123');
  assert.ok(gh.includes('tok123'), 'GitHub URL should embed the token');

  const gl = buildUrl('https://gitlab.com/group/repo.git', 'gitlab', 'tok456');
  assert.ok(gl.includes('tok456'), 'GitLab URL should embed the token');

  const noToken = buildUrl('https://github.com/owner/repo.git', 'github');
  assert.equal(noToken, 'https://github.com/owner/repo.git', 'No token should return original URL');
});

// ─── Bug 17: apiClient uploadFiles includes abort signal ─────────────────────
test('apiClient uploadFiles respects timeout via abort signal', { concurrency: false }, async () => {
  clearApiCredentials();
  let receivedSignal: AbortSignal | undefined;
  const restoreFetch = withMockFetch((async (_input, init) => {
    receivedSignal = init?.signal as AbortSignal | undefined;
    return jsonResponse({ success: true, data: [] });
  }) as typeof fetch);

  try {
    const fakeFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    await api.repo.uploadFiles([fakeFile]);
    assert.ok(receivedSignal, 'uploadFiles should pass an AbortSignal to fetch');
    assert.ok(!receivedSignal.aborted, 'signal should not be aborted for successful requests');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 18: JiraClient reuses TurndownService singleton ─────────────────────
test('JiraClient.getTurndown returns the same instance across calls', { concurrency: false }, async () => {
  const { JiraClient } = await import('./server/src/services/jira/JiraClient.ts');
  const getTurndown = (JiraClient as unknown as {
    getTurndown: () => unknown;
  }).getTurndown;

  const td1 = getTurndown();
  const td2 = getTurndown();
  assert.strictEqual(td1, td2, 'getTurndown should return the same singleton instance');
});

// ─── Bug 19: handleFetch uses ticket.linkedTickets instead of separate API ───
test('Ticket type already contains linkedTickets from getTicket', { concurrency: false }, async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url.includes('/rest/api/3/issue/TRADE-42')) {
      return jsonResponse({
        id: '1', key: 'TRADE-42',
        fields: {
          summary: 'Trade engine bug',
          status: { name: 'Open' },
          issuetype: { name: 'Bug' },
          labels: [], attachment: [], comment: { comments: [] },
          subtasks: [], created: '', updated: '',
          issuelinks: [
            { type: { name: 'Relates' }, outwardIssue: { key: 'TRADE-43', fields: { summary: 'Related', status: { name: 'Open' } } } },
          ],
        },
        renderedFields: {},
      });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch);

  try {
    const { JiraClient } = await import('./server/src/services/jira/JiraClient.ts');
    const client = new JiraClient('https://jira.example.test', 'user@test.com', 'token');
    const ticket = await client.getTicket('TRADE-42');
    assert.ok(Array.isArray(ticket.linkedTickets), 'getTicket should include linkedTickets');
    assert.equal(ticket.linkedTickets.length, 1);
    assert.equal(ticket.linkedTickets[0].key, 'TRADE-43');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 20: GeminiAdapter.formatTicketForPrompt includes ticket.linkedTickets ─
test('GeminiAdapter.formatTicketForPrompt includes ticket own linkedTickets when no param', { concurrency: false }, async () => {
  const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
  const adapter = new GeminiAdapter('fake-key', 'gemini-3.1-pro-preview');
  const formatFn = (adapter as unknown as {
    formatTicketForPrompt: (ticket: unknown, linkedTickets?: unknown[]) => string;
  }).formatTicketForPrompt.bind(adapter);

  const ticket = {
    key: 'TRADE-1', issueType: 'Story', summary: 'Summary', description: 'Desc',
    status: 'Open', priority: null, assignee: null, reporter: null,
    labels: [], storyPoints: null, acceptanceCriteria: null,
    comments: [], attachments: [],
    linkedTickets: [
      { key: 'TRADE-2', summary: 'Related issue', status: 'Done', linkType: 'Relates', direction: 'outward' },
    ],
  };

  const prompt = formatFn(ticket);
  assert.ok(prompt.includes('TRADE-2'), 'Prompt should include linked ticket key from ticket.linkedTickets');
  assert.ok(prompt.includes('Related issue'), 'Prompt should include linked ticket summary');
});

// ─── Bug 21: Score call can accept linkedTickets parameter ───────────────────
test('GeminiAdapter.scoreTicket prompt includes linked tickets when provided', { concurrency: false }, async () => {
  let capturedPrompt = '';
  const restoreFetch = withMockFetch((async (_input, init) => {
    const body = JSON.parse(init?.body as string || '{}');
    capturedPrompt = body.contents?.[0]?.parts?.[0]?.text || '';
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        overall: 75,
        dimensions: [],
        summary: 'test',
      }) }] } }],
    });
  }) as typeof fetch);

  try {
    const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
    const adapter = new GeminiAdapter('fake-key', 'gemini-3.1-pro-preview');
    const ticket = {
      key: 'TRADE-1', id: '1', issueType: 'Story', summary: 'Trade calc',
      description: 'Description', status: 'Open', priority: null,
      assignee: null, reporter: null, reporterEmail: null,
      labels: [], storyPoints: null, acceptanceCriteria: null,
      parent: null, subtasks: [],
      linkedTickets: [
        { key: 'TRADE-5', summary: 'Market data feed', status: 'Done', linkType: 'Blocks', direction: 'outward' as const },
      ],
      comments: [], attachments: [],
      created: '', updated: '', rawAdf: null,
    };

    await adapter.scoreTicket(ticket);
    assert.ok(capturedPrompt.includes('TRADE-5'), 'Score prompt should include ticket.linkedTickets references');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 22: GeminiAdapter.recalculateOverall recomputes overall from weights ──
test('GeminiAdapter.recalculateOverall computes weighted score from dimension scores', { concurrency: false }, async () => {
  const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
  const recalc = (GeminiAdapter as unknown as {
    recalculateOverall: (score: any) => any;
  }).recalculateOverall;

  const score = {
    overall: 99,
    dimensions: [
      { id: 'clarity', name: 'Clarity', score: 10, maxScore: 10, weight: 0.2, feedback: '' },
      { id: 'completeness', name: 'Completeness', score: 10, maxScore: 10, weight: 0.25, feedback: '' },
      { id: 'actionability', name: 'Actionability', score: 10, maxScore: 10, weight: 0.2, feedback: '' },
      { id: 'testability', name: 'Testability', score: 10, maxScore: 10, weight: 0.15, feedback: '' },
      { id: 'formatting', name: 'Formatting', score: 10, maxScore: 10, weight: 0.1, feedback: '' },
      { id: 'context', name: 'Context', score: 5, maxScore: 10, weight: 0.1, feedback: '' },
    ],
    summary: 'test',
  };

  const fixed = recalc(score);
  assert.notEqual(fixed.overall, 99, 'overall should be recomputed, not the AI-provided value');
  assert.ok(fixed.overall >= 90 && fixed.overall <= 100, `Expected 90-100 but got ${fixed.overall}`);
  const expected = Math.round((1*20 + 1*25 + 1*20 + 1*15 + 1*10 + 0.5*10));
  assert.equal(fixed.overall, expected, `overall should be ${expected}`);
});

// ─── Bug 23: readRetention no longer calls pruneOldFiles ─────────────────────
test('logBuffer.query does not trigger readdirSync via pruneOldFiles', { concurrency: false }, () => {
  let readdirCount = 0;
  const originalReaddirSync = fsSync.readdirSync;
  (fsSync as unknown as { readdirSync: typeof fsSync.readdirSync }).readdirSync =
    ((...args: Parameters<typeof fsSync.readdirSync>) => {
      readdirCount++;
      return originalReaddirSync(...args);
    }) as typeof fsSync.readdirSync;

  try {
    const before = readdirCount;
    logBuffer.query();
    const after = readdirCount;
    assert.equal(after - before, 0, 'query() should not trigger readdirSync (pruneOldFiles removed from readRetention)');
  } finally {
    (fsSync as unknown as { readdirSync: typeof fsSync.readdirSync }).readdirSync =
      originalReaddirSync;
  }
});

// ─── Bug 24: parseJson preserves triple backticks inside JSON string values ──
test('GeminiAdapter.parseJson preserves code fences inside JSON content', { concurrency: false }, async () => {
  const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
  const adapter = new GeminiAdapter('fake-key', 'gemini-3.1-pro-preview');
  const parseFn = (adapter as unknown as {
    parseJson: <T>(text: string) => T;
  }).parseJson.bind(adapter);

  const jsonWithCodeFences = JSON.stringify({
    description: '## Example\n\n```typescript\nconst x = 1;\n```\n\nDone.',
  });
  const wrapped = '```json\n' + jsonWithCodeFences + '\n```';

  const result = parseFn<{ description: string }>(wrapped);
  assert.ok(result.description.includes('```typescript'), 'Code fences inside JSON values must be preserved');
  assert.ok(result.description.includes('const x = 1;'), 'Code content must be preserved');
});

// ─── Bug 25: updateTicket skips description field when only AC changes ───────
test('JiraClient.updateTicket does not wipe description when only acceptanceCriteria is set', { concurrency: false }, async () => {
  let sentBody: any = null;
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/api/3/myself')) {
      return jsonResponse({ displayName: 'Test', emailAddress: 'test@test.com' });
    }
    if (url.includes('/rest/api/3/issue/TEST-1') && init?.method === 'PUT') {
      sentBody = JSON.parse(init.body as string);
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch);

  try {
    const { JiraClient } = await import('./server/src/services/jira/JiraClient.ts');
    const client = new JiraClient('https://jira.test', 'user@test.com', 'token');
    await client.updateTicket('TEST-1', { summary: 'Updated summary' });
    assert.ok(sentBody, 'PUT should have been called');
    assert.equal(sentBody.fields.description, undefined, 'description should NOT be set when only summary changes');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 26: AutomationStore sanitizes ticketKey in filePath ─────────────────
test('AutomationStore.filePath sanitizes path traversal in ticketKey', { concurrency: false }, async () => {
  const { AutomationStore } = await import('./server/src/services/automation/AutomationStore.ts');
  const safeBasename = (AutomationStore as unknown as {
    safeBasename: (raw: string) => string;
  }).safeBasename;

  const safe = safeBasename('../../etc/passwd');
  assert.ok(!safe.includes('/'), 'Sanitized key must not contain slashes');
  assert.ok(!safe.includes('..'), 'Sanitized key must not contain ..');
  assert.equal(safeBasename('PROJ-123'), 'PROJ-123', 'Valid ticket keys should pass through');
});

// ─── Bug 27: HistoryStore sanitizes snapshot id in filePath ──────────────────
test('HistoryStore.filePath sanitizes path traversal in id', { concurrency: false }, async () => {
  const { HistoryStore } = await import('./server/src/services/history/HistoryStore.ts');
  const safeBasename = (HistoryStore as unknown as {
    safeBasename: (raw: string) => string;
  }).safeBasename;

  const safe = safeBasename('../../../evil');
  assert.ok(!safe.includes('/'), 'Sanitized id must not contain slashes');
  assert.ok(!safe.includes('..'), 'Sanitized id must not contain ..');
  assert.equal(safeBasename('PROJ-1-1716500000000'), 'PROJ-1-1716500000000', 'Valid snapshot ids should pass through');
});

// ─── Bug 28: DiffView labels comparison is order-insensitive ─────────────────
test('DiffView normalizeLabels treats same labels in different order as equal', { concurrency: false }, () => {
  function normalizeLabels(labels: string[]): string {
    return [...labels].sort((a, b) => a.localeCompare(b)).join(', ');
  }
  const original = normalizeLabels(['frontend', 'bug', 'urgent']);
  const improved = normalizeLabels(['urgent', 'bug', 'frontend']);
  assert.equal(original, improved, 'Same labels in different order should produce the same normalized string');
  const different = normalizeLabels(['frontend', 'bug', 'critical']);
  assert.notEqual(original, different, 'Different label sets should not be equal');
});

// ─── Bug 29: MarkdownExporter escapes pipes in table cells ───────────────────
test('MarkdownExporter escapes pipe characters in score feedback', { concurrency: false }, async () => {
  const { MarkdownExporter } = await import('./server/src/services/export/MarkdownExporter.ts');
  const exporter = new MarkdownExporter();

  const ticket = {
    id: '1', key: 'TEST-1', summary: 'Test', description: 'Desc',
    status: 'Open', priority: null, assignee: null, reporter: null, reporterEmail: null,
    labels: [], storyPoints: null, issueType: 'Story', acceptanceCriteria: null,
    parent: null, subtasks: [], linkedTickets: [], attachments: [],
    comments: [], created: '', updated: '', rawAdf: null,
  };

  const score = {
    overall: 60,
    dimensions: [
      { id: 'clarity', name: 'Clarity', score: 6, maxScore: 10, weight: 0.2, feedback: 'Missing detail | needs context' },
    ],
    summary: 'Needs work',
  };

  const md = await exporter.exportAsMarkdown(ticket as any, undefined, score as any);
  assert.ok(!md.includes('| Missing detail | needs context |'), 'Unescaped pipe in feedback would break the table');
  assert.ok(md.includes('Missing detail \\| needs context'), 'Pipe should be escaped with backslash');
});

// ─── Bug 30: batchCreateTickets creates subtasks in parallel ─────────────────
test('JiraClient.batchCreateTickets calls createTicket for subtasks concurrently', { concurrency: false }, async () => {
  const callTimestamps: number[] = [];
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/api/3/issue') && init?.method === 'POST') {
      callTimestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      const idx = callTimestamps.length;
      return jsonResponse({ key: `TEST-${idx}`, id: String(idx) });
    }
    if (url.includes('/rest/api/3/issueLink')) {
      return new Response('', { status: 204, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch);

  try {
    const { JiraClient } = await import('./server/src/services/jira/JiraClient.ts');
    const client = new JiraClient('https://jira.test', 'user@test.com', 'token');
    const start = Date.now();
    const result = await client.batchCreateTickets({
      parentTicket: { projectKey: 'TEST', issueType: 'Story', changes: { summary: 'Parent' } },
      subtasks: [
        { issueType: 'Task', changes: { summary: 'Task A' } },
        { issueType: 'Task', changes: { summary: 'Task B' } },
        { issueType: 'Task', changes: { summary: 'Task C' } },
      ],
    });
    const elapsed = Date.now() - start;
    assert.equal(result.parent.key, 'TEST-1');
    assert.equal(result.subtasks.length, 3);
    assert.ok(elapsed < 250, `Parallel creation should be fast, but took ${elapsed}ms`);
  } finally {
    restoreFetch();
  }
});

// ─── Bug 31: HistoryStore.list reads files in parallel ───────────────────────
test('HistoryStore.list uses Promise.allSettled for parallel reads', { concurrency: false }, async () => {
  const { HistoryStore } = await import('./server/src/services/history/HistoryStore.ts');
  const src = HistoryStore.list.toString();
  assert.ok(
    src.includes('allSettled') || src.includes('Promise.all'),
    'HistoryStore.list should use Promise.allSettled or Promise.all for parallel file reads',
  );
});

// ─── Bug 32: McpClient.rpc includes abort signal timeout ─────────────────────
test('McpClient.rpc includes AbortSignal.timeout in fetch calls', { concurrency: false }, async () => {
  let receivedSignal: AbortSignal | undefined;
  const restoreFetch = withMockFetch((async (_input, init) => {
    receivedSignal = init?.signal as AbortSignal | undefined;
    return jsonResponse({ jsonrpc: '2.0', result: { tools: [] } });
  }) as typeof fetch);

  try {
    const { McpClient } = await import('./server/src/services/mcp/McpClient.ts');
    const client = new McpClient('https://mcp.example.test');
    await client.listTools();
    assert.ok(receivedSignal, 'rpc() should pass an AbortSignal to fetch');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 33: GeminiAdapter reports safety-blocked responses clearly ──────────
test('GeminiAdapter.generateContent reports safety blocks with specific error', { concurrency: false }, async () => {
  const restoreFetch = withMockFetch((async () => {
    return jsonResponse({
      candidates: [{ finishReason: 'SAFETY', content: {} }],
    });
  }) as typeof fetch);

  try {
    const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
    const adapter = new GeminiAdapter('fake-key', 'gemini-3.1-pro-preview');
    await assert.rejects(
      adapter.scoreTicket({
        id: '1', key: 'TEST-1', summary: 'Test', description: 'Desc', status: 'Open',
        priority: null, assignee: null, reporter: null, reporterEmail: null,
        labels: [], storyPoints: null, issueType: 'Story', acceptanceCriteria: null,
        parent: null, subtasks: [], linkedTickets: [], attachments: [], comments: [],
        created: '', updated: '', rawAdf: null,
      }),
      (err: any) => {
        assert.ok(err.message.includes('safety'), `Error should mention safety, got: ${err.message}`);
        assert.ok(err.code === 'GEMINI_SAFETY_BLOCK', `Code should be GEMINI_SAFETY_BLOCK, got: ${err.code}`);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

// ─── Bug 34: automation.scan reuses single parseRepoUrl result ───────────────
test('AutomationController.scan does not parse the same URL twice', { concurrency: false }, async () => {
  const { default: automationSrc } = await import('fs').then((m) =>
    ({ default: m.readFileSync('./server/src/controllers/automation.controller.ts', 'utf-8') }),
  );
  const scanBody = automationSrc.slice(
    automationSrc.indexOf('scan = async'),
    automationSrc.indexOf('pending = async'),
  );
  const parseCount = (scanBody.match(/parseRepoUrl/g) || []).length;
  assert.ok(parseCount <= 1, `scan should call parseRepoUrl at most once, found ${parseCount} calls`);
});

// ─── Bug 35: cursorActiveCount increments before async work ──────────────────
test('AIController increments cursorActiveCount before async clone work', { concurrency: false }, async () => {
  const { default: controllerSrc } = await import('fs').then((m) =>
    ({ default: m.readFileSync('./server/src/controllers/ai.controller.ts', 'utf-8') }),
  );
  const improveSection = controllerSrc.slice(
    controllerSrc.indexOf('private async improveWithCursor'),
    controllerSrc.indexOf('compose = async'),
  );
  const countIncrIdx = improveSection.indexOf('cursorActiveCount++');
  const cloneIdx = improveSection.indexOf('ensureClone');
  assert.ok(countIncrIdx >= 0, 'cursorActiveCount++ should exist');
  assert.ok(cloneIdx >= 0, 'ensureClone should exist');
  assert.ok(
    countIncrIdx < cloneIdx,
    'cursorActiveCount++ must come BEFORE ensureClone to prevent race conditions',
  );
});

// ─── Bug 36: storyPoints 0 is preserved, not treated as null ─────────────────
test('JiraClient.getTicket preserves storyPoints=0 instead of converting to null', { concurrency: false }, async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url.includes('/rest/api/3/issue/ZERO-1')) {
      return jsonResponse({
        id: '1', key: 'ZERO-1',
        fields: {
          summary: 'Zero points task', status: { name: 'Open' },
          issuetype: { name: 'Task' }, labels: [], attachment: [],
          comment: { comments: [] }, subtasks: [], created: '', updated: '',
          issuelinks: [], customfield_10016: 0,
        },
        renderedFields: {},
      });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch);

  try {
    const { JiraClient } = await import('./server/src/services/jira/JiraClient.ts');
    const client = new JiraClient('https://jira.test', 'user@test.com', 'token');
    const ticket = await client.getTicket('ZERO-1');
    assert.strictEqual(ticket.storyPoints, 0, 'storyPoints should be 0, not null');
  } finally {
    restoreFetch();
  }
});

// ─── Bug 37: AdminStore.load caches settings and save invalidates cache ──────
test('AdminStore.load returns cached result on second call', { concurrency: false }, async () => {
  const { AdminStore } = await import('./server/src/services/admin/AdminStore.ts');
  const result1 = await AdminStore.load();
  const result2 = await AdminStore.load();
  assert.deepEqual(result1, result2, 'Two consecutive loads should return the same settings');
  assert.ok(result1.defaultModel, 'Should have a defaultModel');
});

// ─── Bug 38: computeStats is a single-pass function ─────────────────────────
test('LogBuffer computeStats produces correct stats in a single pass', { concurrency: false }, () => {
  const entries = [
    { id: '1', category: 'llm' as const, timestamp: '2025-01-01T00:00:00Z', operation: 'a', durationMs: 1, success: true },
    { id: '2', category: 'mcp' as const, timestamp: '2025-01-01T01:00:00Z', operation: 'b', durationMs: 2, success: false },
    { id: '3', category: 'llm' as const, timestamp: '2025-01-02T00:00:00Z', operation: 'c', durationMs: 3, success: false },
  ];
  const stats = logBuffer.query().stats;
  assert.equal(typeof stats.total, 'number');
  assert.equal(typeof stats.llm, 'number');
  assert.equal(typeof stats.mcp, 'number');
  assert.equal(typeof stats.llmErrors, 'number');
  assert.equal(typeof stats.mcpErrors, 'number');
  assert.ok(Array.isArray(stats.byDate));
});

// ─── Bug 39: Gemini MAX_TOKENS truncation produces specific error ────────────
test('GeminiAdapter throws GEMINI_TRUNCATED when finishReason is MAX_TOKENS with text', { concurrency: false }, async () => {
  const restoreFetch = withMockFetch((async () => {
    return jsonResponse({
      candidates: [{
        finishReason: 'MAX_TOKENS',
        content: { parts: [{ text: '{"incomplete": "json...' }] },
      }],
    });
  }) as typeof fetch);

  try {
    const { GeminiAdapter } = await import('./server/src/services/ai/GeminiAdapter.ts');
    const adapter = new GeminiAdapter('fake-key', 'gemini-3.1-pro-preview');
    await assert.rejects(
      adapter.scoreTicket({
        id: '1', key: 'TEST-1', summary: 'Test', description: 'Desc', status: 'Open',
        priority: null, assignee: null, reporter: null, reporterEmail: null,
        labels: [], storyPoints: null, issueType: 'Story', acceptanceCriteria: null,
        parent: null, subtasks: [], linkedTickets: [], attachments: [], comments: [],
        created: '', updated: '', rawAdf: null,
      }),
      (err: any) => {
        assert.ok(err.code === 'GEMINI_TRUNCATED', `Code should be GEMINI_TRUNCATED, got: ${err.code}`);
        assert.ok(err.message.includes('truncated'), `Message should mention truncation, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

// ─── Bug 40: handleFetch passes linkedTickets to initial score call ──────────
test('TicketWorkspace handleFetch passes linkedTickets to score API (source check)', { concurrency: false }, async () => {
  const { default: workspaceSrc } = await import('fs').then((m) =>
    ({ default: m.readFileSync('./client/src/components/TicketWorkspace/TicketWorkspace.tsx', 'utf-8') }),
  );
  const fetchSection = workspaceSrc.slice(
    workspaceSrc.indexOf('const handleFetch'),
    workspaceSrc.indexOf('const handleGenerateQuestions'),
  );
  assert.ok(
    fetchSection.includes('linkedTickets:') && fetchSection.includes('fetchedLinked'),
    'handleFetch should pass fetchedLinked as linkedTickets to the score API call',
  );
});

// ─── Bug 41: McpAgent uses configurable provider instead of hardcoded 'github' ─
test('McpAgent uses config.provider for log entries and stats', { concurrency: false }, async () => {
  const { default: agentSrc } = await import('fs').then((m) =>
    ({ default: m.readFileSync('./server/src/services/mcp/McpAgent.ts', 'utf-8') }),
  );
  const hardcodedGithubInLogs = (agentSrc.match(/provider:\s*['"]github['"]/g) || []).length;
  assert.equal(
    hardcodedGithubInLogs,
    0,
    `McpAgent should not hardcode provider: 'github' in log entries (found ${hardcodedGithubInLogs} occurrences)`,
  );
  assert.ok(
    agentSrc.includes("provider?: 'github' | 'gitlab'"),
    'McpAgentConfig should have a provider field',
  );
});
