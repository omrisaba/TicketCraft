import type { Ticket, TicketChanges, LinkedTicket, JiraProject, JiraIssueType, JiraUser, BatchCreateResponse } from 'ticketcraft-shared';
import type { IssueTracker, UserInfo } from '../interfaces/IssueTracker.js';
import { AppError } from '../../middleware/errorHandler.js';
import { markdownToAdf } from 'marklassian';
import TurndownService from 'turndown';

export class JiraClient implements IssueTracker {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl;
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/rest/api/3${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new AppError(401, 'JIRA_AUTH_FAILED', 'Jira authentication failed.');
      }
      if (response.status === 404) {
        throw new AppError(404, 'JIRA_NOT_FOUND', 'Jira resource not found.', body);
      }
      throw new AppError(response.status, 'JIRA_API_ERROR', `Jira API error: ${response.statusText}`, body);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async validateCredentials(): Promise<UserInfo> {
    const data = await this.request<any>('/myself');
    return {
      displayName: data.displayName,
      emailAddress: data.emailAddress,
      avatarUrl: data.avatarUrls?.['48x48'] || null,
    };
  }

  async getTicket(ticketKey: string): Promise<Ticket> {
    const data = await this.request<any>(
      `/issue/${ticketKey}?expand=renderedFields&fields=summary,description,status,priority,assignee,reporter,labels,customfield_10016,issuetype,issuelinks,attachment,comment,created,updated,parent,subtasks`,
    );

    const fields = data.fields;
    const rendered = data.renderedFields || {};

    const renderedComments = rendered.comment?.comments || [];

    return {
      id: data.id,
      key: data.key,
      summary: fields.summary || '',
      description: this.htmlToMarkdown(rendered.description) || this.extractTextFallback(fields.description),
      status: fields.status?.name || 'Unknown',
      priority: fields.priority?.name || null,
      assignee: fields.assignee?.displayName || null,
      reporter: fields.reporter?.displayName || null,
      reporterEmail: fields.reporter?.emailAddress || null,
      labels: fields.labels || [],
      storyPoints: fields.customfield_10016 || null,
      issueType: fields.issuetype?.name || 'Task',
      acceptanceCriteria: null,
      parent: fields.parent ? {
        key: fields.parent.key,
        summary: fields.parent.fields?.summary || '',
        status: fields.parent.fields?.status?.name || 'Unknown',
        issueType: fields.parent.fields?.issuetype?.name || 'Task',
      } : null,
      subtasks: (fields.subtasks || []).map((st: any) => ({
        key: st.key,
        summary: st.fields?.summary || '',
        status: st.fields?.status?.name || 'Unknown',
        issueType: st.fields?.issuetype?.name || 'Sub-task',
      })),
      linkedTickets: (fields.issuelinks || []).map((link: any) => this.mapLinkedTicket(link)),
      attachments: (fields.attachment || []).map((att: any) => ({
        id: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        url: att.content,
        created: att.created,
      })),
      comments: (fields.comment?.comments || []).map((c: any, i: number) => ({
        id: c.id,
        author: c.author?.displayName || 'Unknown',
        body: this.htmlToMarkdown(renderedComments[i]?.body) || this.extractTextFallback(c.body),
        created: c.created,
        updated: c.updated,
      })),
      created: fields.created,
      updated: fields.updated,
      rawAdf: fields.description,
    };
  }

  async updateTicket(ticketKey: string, changes: TicketChanges): Promise<void> {
    const updateFields: any = {};

    if (changes.summary !== undefined) {
      updateFields.summary = changes.summary;
    }

    let fullDescription = changes.description ?? '';
    if (changes.acceptanceCriteria) {
      fullDescription += `\n\n## Acceptance Criteria\n\n${changes.acceptanceCriteria}`;
    }
    if (fullDescription) {
      updateFields.description = this.textToAdf(fullDescription);
    }

    if (changes.labels !== undefined) {
      updateFields.labels = changes.labels;
    }

    if (changes.storyPoints !== undefined) {
      updateFields.customfield_10016 = changes.storyPoints;
    }

    if (ticketKey.split('-')[0].toUpperCase() === 'GENIE') {
      updateFields.components = [{ name: 'UnifAI' }];
    }

    await this.request(`/issue/${ticketKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: updateFields }),
    });
  }

  async uploadAttachment(ticketKey: string, file: Buffer, filename: string, mimeType: string): Promise<void> {
    const boundary = `----FormBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = `${this.baseUrl}/rest/api/3/issue/${ticketKey}/attachments`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Atlassian-Token': 'no-check',
      },
      body,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new AppError(response.status, 'JIRA_ATTACHMENT_ERROR', 'Failed to upload attachment.', errBody);
    }
  }

  async createTicket(opts: {
    projectKey: string;
    issueType: string;
    changes: TicketChanges;
    parentKey?: string;
    assigneeAccountId?: string;
  }): Promise<{ key: string; id: string }> {
    const fields: any = {
      project: { key: opts.projectKey },
      issuetype: { name: opts.issueType },
    };

    if (opts.changes.summary) fields.summary = opts.changes.summary;

    let fullDescription = opts.changes.description ?? '';
    if (opts.changes.acceptanceCriteria) {
      fullDescription += `\n\n## Acceptance Criteria\n\n${opts.changes.acceptanceCriteria}`;
    }
    if (fullDescription) {
      fields.description = this.textToAdf(fullDescription);
    }

    if (opts.changes.labels?.length) fields.labels = opts.changes.labels;
    if (opts.changes.storyPoints != null) fields.customfield_10016 = opts.changes.storyPoints;
    if (opts.parentKey) fields.parent = { key: opts.parentKey };
    if (opts.assigneeAccountId) fields.assignee = { accountId: opts.assigneeAccountId };
    if (opts.projectKey.toUpperCase() === 'GENIE') {
      fields.components = [{ name: 'UnifAI' }];
    }

    const data = await this.request<any>('/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });

    return { key: data.key, id: data.id };
  }

  async linkTickets(inwardKey: string, outwardKey: string, linkType = 'Relates'): Promise<void> {
    await this.request('/issueLink', {
      method: 'POST',
      body: JSON.stringify({
        type: { name: linkType },
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey },
      }),
    });
  }

  async addComment(ticketKey: string, markdownBody: string): Promise<void> {
    await this.request(`/issue/${ticketKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body: this.textToAdf(markdownBody) }),
    });
  }

  async getLinkedTickets(ticketKey: string): Promise<LinkedTicket[]> {
    const ticket = await this.getTicket(ticketKey);
    return ticket.linkedTickets;
  }

  async searchByJql(jql: string, maxResults = 50): Promise<string[]> {
    const data = await this.request<any>('/search/jql', {
      method: 'POST',
      body: JSON.stringify({ jql, maxResults, fields: ['key'] }),
    });
    return (data.issues || []).map((issue: any) => issue.key as string);
  }

  async searchByJqlDetailed(
    jql: string,
    maxResults = 50,
  ): Promise<{ key: string; summary: string; status: string; issueType: string; assignee: string | null }[]> {
    const data = await this.request<any>('/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql,
        maxResults,
        fields: ['key', 'summary', 'status', 'issuetype', 'assignee'],
      }),
    });
    return (data.issues || []).map((issue: any) => ({
      key: issue.key as string,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || 'Unknown',
      issueType: issue.fields?.issuetype?.name || 'Task',
      assignee: issue.fields?.assignee?.displayName || null,
    }));
  }

  async getProjects(query?: string): Promise<JiraProject[]> {
    const params = new URLSearchParams({ maxResults: '200', orderBy: 'key' });
    if (query) params.set('query', query);
    const data = await this.request<any>(`/project/search?${params}`);
    return (data.values || []).map((p: any) => ({
      key: p.key,
      name: p.name,
      avatarUrl: p.avatarUrls?.['48x48'] || null,
    }));
  }

  async getIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    const data = await this.request<any>(`/project/${projectKey}`);
    return (data.issueTypes || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      subtask: t.subtask ?? false,
      description: t.description || '',
    }));
  }

  async getAssignableUsers(projectKey: string, query?: string): Promise<JiraUser[]> {
    const params = new URLSearchParams({ project: projectKey, maxResults: '50' });
    if (query) params.set('query', query);
    const data = await this.request<any[]>(`/user/assignable/search?${params}`);
    return (data || []).map((u: any) => ({
      accountId: u.accountId,
      displayName: u.displayName || u.name || 'Unknown',
      avatarUrl: u.avatarUrls?.['48x48'] || null,
    }));
  }

  async batchCreateTickets(opts: {
    parentTicket: { projectKey: string; issueType: string; changes: TicketChanges; assigneeAccountId?: string };
    subtasks: { issueType: string; changes: TicketChanges }[];
  }): Promise<BatchCreateResponse> {
    const parent = await this.createTicket({
      projectKey: opts.parentTicket.projectKey,
      issueType: opts.parentTicket.issueType,
      changes: opts.parentTicket.changes,
      assigneeAccountId: opts.parentTicket.assigneeAccountId,
    });

    const subtaskResults: { key: string; id: string; summary: string }[] = [];
    const errors: { index: number; summary: string; error: string }[] = [];

    for (let i = 0; i < opts.subtasks.length; i++) {
      const st = opts.subtasks[i];
      try {
        const isSubtaskType = /^sub.?task$/i.test(st.issueType);
        const created = await this.createTicket({
          projectKey: opts.parentTicket.projectKey,
          issueType: st.issueType,
          changes: st.changes,
          parentKey: isSubtaskType ? parent.key : undefined,
        });
        if (!isSubtaskType) {
          try { await this.linkTickets(created.key, parent.key, 'Relates'); } catch { /* best-effort */ }
        }
        subtaskResults.push({ key: created.key, id: created.id, summary: st.changes.summary || '' });
      } catch (err: any) {
        errors.push({ index: i, summary: st.changes.summary || '', error: err.message || 'Unknown error' });
      }
    }

    return { parent, subtasks: subtaskResults, errors };
  }

  async swapLabels(ticketKey: string, removeLabel: string, addLabel: string): Promise<void> {
    await this.request(`/issue/${ticketKey}`, {
      method: 'PUT',
      body: JSON.stringify({
        update: {
          labels: [
            { remove: removeLabel },
            { add: addLabel },
          ],
        },
      }),
    });
  }

  private mapLinkedTicket(link: any): LinkedTicket {
    const isInward = !!link.inwardIssue;
    const issue = isInward ? link.inwardIssue : link.outwardIssue;
    return {
      key: issue?.key || '',
      summary: issue?.fields?.summary || '',
      status: issue?.fields?.status?.name || 'Unknown',
      linkType: link.type?.name || 'Related',
      direction: isInward ? 'inward' : 'outward',
    };
  }

  private htmlToMarkdown(html: string | null | undefined): string | null {
    if (!html || typeof html !== 'string') return null;
    const cleaned = html.trim();
    if (!cleaned) return null;

    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    turndown.addRule('jiraPanels', {
      filter: (node) => {
        const className = node.getAttribute?.('class') || '';
        return className.includes('panel') || node.tagName === 'AC:STRUCTURED-MACRO';
      },
      replacement: (_content, node) => {
        const textContent = node.textContent?.trim() || '';
        return textContent ? `\n\n> ${textContent.replace(/\n/g, '\n> ')}\n\n` : '';
      },
    });

    turndown.addRule('jiraCheckboxes', {
      filter: (node) => node.tagName === 'LI' && (node.getAttribute?.('class') || '').includes('task'),
      replacement: (content) => {
        const checked = content.includes('[x]') || content.includes('✓');
        return `- [${checked ? 'x' : ' '}] ${content.replace(/^\[[ x]\]\s*/, '').trim()}\n`;
      },
    });

    try {
      const md = turndown.turndown(cleaned);
      return md.trim() || null;
    } catch {
      return cleaned.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null;
    }
  }

  private extractTextFallback(node: any): string | null {
    if (!node) return null;
    if (typeof node === 'string') return node;
    if (node.type === 'text') return node.text || '';
    if (node.content && Array.isArray(node.content)) {
      return node.content.map((n: any) => this.extractTextFallback(n)).filter(Boolean).join('\n');
    }
    return null;
  }

  private textToAdf(text: string): any {
    return markdownToAdf(text);
  }
}
