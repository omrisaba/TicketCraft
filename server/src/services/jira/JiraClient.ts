import type { Ticket, TicketChanges, LinkedTicket, JiraProject, JiraIssueType, JiraUser, BatchCreateResponse } from 'ticketcraft-shared';
import type { IssueTracker, UserInfo } from '../interfaces/IssueTracker.js';
import { AppError } from '../../middleware/errorHandler.js';
import TurndownService from 'turndown';
import { markdownToJiraAdf } from './adf.js';

type AcField = { id: string; format: 'adf' | 'text' };

export class JiraClient implements IssueTracker {
  private baseUrl: string;
  private authHeader: string;
  private static readonly storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10016';
  private static readonly acFieldByHost = new Map<string, AcField | null>();

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl;
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  static resetAcFieldCache(): void {
    JiraClient.acFieldByHost.clear();
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
    const acField = await this.resolveAcceptanceCriteriaField();
    const acFieldQuery = acField ? `,${acField.id}` : '';
    const data = await this.request<any>(
      `/issue/${ticketKey}?expand=renderedFields&fields=summary,description,status,priority,assignee,reporter,labels,${JiraClient.storyPointsField}${acFieldQuery},issuetype,issuelinks,attachment,comment,created,updated,parent,subtasks`,
    );

    const fields = data.fields;
    const rendered = data.renderedFields || {};

    const renderedComments = rendered.comment?.comments || [];
    const descriptionMarkdown = this.htmlToMarkdown(rendered.description) || this.extractTextFallback(fields.description);
    const acceptanceCriteria = this.extractAcceptanceCriteriaValue(fields, rendered, acField, descriptionMarkdown);

    return {
      id: data.id,
      key: data.key,
      summary: fields.summary || '',
      description: JiraClient.extractDescription(descriptionMarkdown),
      status: fields.status?.name || 'Unknown',
      priority: fields.priority?.name || null,
      assignee: fields.assignee?.displayName || null,
      reporter: fields.reporter?.displayName || null,
      reporterEmail: fields.reporter?.emailAddress || null,
      labels: fields.labels || [],
      storyPoints: fields[JiraClient.storyPointsField] ?? null,
      issueType: fields.issuetype?.name || 'Task',
      acceptanceCriteria,
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

  async updateTicket(ticketKey: string, changes: TicketChanges, expectedUpdated?: string): Promise<void> {
    if (expectedUpdated) {
      const current = await this.request<any>(
        `/issue/${ticketKey}?fields=updated`,
      );
      const jiraUpdated = current?.fields?.updated;
      if (jiraUpdated && jiraUpdated !== expectedUpdated) {
        throw new AppError(
          409,
          'JIRA_CONCURRENT_EDIT',
          'This ticket was modified in Jira since you last fetched it. Please refresh the ticket and try again.',
        );
      }
    }

    const updateFields: any = {};

    if (changes.summary !== undefined) {
      updateFields.summary = changes.summary;
    }

    const hasDescription = changes.description !== undefined;
    const hasAc = changes.acceptanceCriteria !== undefined && changes.acceptanceCriteria !== null;
    const acField = (hasDescription || hasAc) ? await this.resolveAcceptanceCriteriaField() : null;
    let descriptionForFallback = '';
    if (hasDescription || hasAc) {
      let baseDescription: string;
      if (hasDescription) {
        baseDescription = changes.description ?? '';
      } else {
        const existing = await this.getTicket(ticketKey);
        baseDescription = existing.description ?? '';
      }
      const stripped = JiraClient.stripAcceptanceCriteriaSection(baseDescription);
      const ac = hasAc ? changes.acceptanceCriteria : undefined;
      descriptionForFallback = ac ? `${stripped}\n\n## Acceptance Criteria\n\n${ac}` : stripped;

      if (acField && hasAc) {
        updateFields[acField.id] = this.formatAcValue(ac ?? '', acField);
        if (hasDescription || stripped !== baseDescription.trim()) {
          if (stripped.trim()) updateFields.description = this.textToAdf(stripped);
        }
      } else if (descriptionForFallback.trim()) {
        updateFields.description = this.textToAdf(descriptionForFallback);
      }
    }

    if (changes.labels !== undefined) {
      updateFields.labels = changes.labels;
    }

    if (changes.storyPoints !== undefined) {
      updateFields[JiraClient.storyPointsField] = changes.storyPoints;
    }

    try {
      await this.request(`/issue/${ticketKey}`, {
        method: 'PUT',
        body: JSON.stringify({ fields: updateFields }),
      });
    } catch (err) {
      if (acField && hasAc && this.isMissingScreenField(err, acField.id)) {
        delete updateFields[acField.id];
        if (descriptionForFallback.trim()) {
          updateFields.description = this.textToAdf(descriptionForFallback);
        }
        await this.request(`/issue/${ticketKey}`, {
          method: 'PUT',
          body: JSON.stringify({ fields: updateFields }),
        });
        return;
      }
      throw err;
    }
  }

  async uploadAttachment(ticketKey: string, file: Buffer, filename: string, mimeType: string): Promise<void> {
    const boundary = `----FormBoundary${Date.now()}`;
    const safeFilename = filename.replace(/[\r\n]/g, ' ').replace(/"/g, '\\"');
    const safeMimeType = /^[\w.+\-]+\/[\w.+\-]+$/.test(mimeType) ? mimeType : 'application/octet-stream';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${safeMimeType}\r\n\r\n`),
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

    const acField = await this.resolveAcceptanceCriteriaField();
    let fullDescription = JiraClient.stripAcceptanceCriteriaSection(opts.changes.description ?? '');
    const acText = opts.changes.acceptanceCriteria?.trim() || '';
    if (acField && acText) {
      fields[acField.id] = this.formatAcValue(acText, acField);
    } else if (acText) {
      fullDescription += `\n\n## Acceptance Criteria\n\n${acText}`;
    }
    if (fullDescription.trim()) {
      fields.description = this.textToAdf(fullDescription);
    }

    if (opts.changes.labels?.length) fields.labels = opts.changes.labels;
    if (opts.changes.storyPoints != null) fields[JiraClient.storyPointsField] = opts.changes.storyPoints;
    if (opts.parentKey) fields.parent = { key: opts.parentKey };
    if (opts.assigneeAccountId) fields.assignee = { accountId: opts.assigneeAccountId };

    try {
      const data = await this.request<any>('/issue', {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });
      return { key: data.key, id: data.id };
    } catch (err) {
      if (acField && acText && this.isMissingScreenField(err, acField.id)) {
        delete fields[acField.id];
        const fallback = `${fullDescription}\n\n## Acceptance Criteria\n\n${acText}`;
        fields.description = this.textToAdf(fallback);
        const data = await this.request<any>('/issue', {
          method: 'POST',
          body: JSON.stringify({ fields }),
        });
        return { key: data.key, id: data.id };
      }
      throw err;
    }
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

    const results = await Promise.allSettled(
      opts.subtasks.map(async (st, i) => {
        const isSubtaskType = /^sub.?task$/i.test(st.issueType);
        const created = await this.createTicket({
          projectKey: opts.parentTicket.projectKey,
          issueType: st.issueType,
          changes: st.changes,
          parentKey: isSubtaskType ? parent.key : undefined,
          assigneeAccountId: opts.parentTicket.assigneeAccountId,
        });
        if (!isSubtaskType) {
          try { await this.linkTickets(created.key, parent.key, 'Relates'); } catch { /* best-effort */ }
        }
        return { index: i, key: created.key, id: created.id, summary: st.changes.summary || '' };
      }),
    );

    const subtaskResults: { key: string; id: string; summary: string }[] = [];
    const errors: { index: number; summary: string; error: string }[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        subtaskResults.push({ key: r.value.key, id: r.value.id, summary: r.value.summary });
      } else {
        const idx = results.indexOf(r);
        errors.push({ index: idx, summary: opts.subtasks[idx]?.changes.summary || '', error: (r.reason as Error)?.message || 'Unknown error' });
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

  private acFieldCacheKey(): string {
    const envId = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || '').trim().toLowerCase();
    return `${this.baseUrl}::${envId}`;
  }

  private static isAdfCustomField(schema: { type?: string; custom?: string } | undefined): boolean {
    const type = String(schema?.type || '');
    const custom = String(schema?.custom || '');
    if (type === 'doc') return true;
    return /textarea|rich-text|richtext|atlassian-document|adf/i.test(custom);
  }

  private pickAcceptanceCriteriaField(fields: any[]): AcField | null {
    const envId = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || '').trim();
    if (envId && /^(none|off|false|description)$/i.test(envId)) return null;

    const named = fields.filter((f) =>
      typeof f?.name === 'string' && /^acceptance\s*criteria$/i.test(f.name.trim()),
    );

    let chosen = envId ? fields.find((f) => f.id === envId) : undefined;
    if (!chosen) chosen = named.find((f) => JiraClient.isAdfCustomField(f.schema)) || named[0];

    if (envId && /^customfield_\d+$/i.test(envId) && !chosen) {
      return { id: envId, format: 'adf' };
    }
    if (!chosen?.id) return null;

    return {
      id: chosen.id,
      format: JiraClient.isAdfCustomField(chosen.schema) ? 'adf' : 'text',
    };
  }

  private async resolveAcceptanceCriteriaField(): Promise<AcField | null> {
    const key = this.acFieldCacheKey();
    if (JiraClient.acFieldByHost.has(key)) return JiraClient.acFieldByHost.get(key) ?? null;

    const envId = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || '').trim();
    if (envId && /^(none|off|false|description)$/i.test(envId)) {
      JiraClient.acFieldByHost.set(key, null);
      return null;
    }

    let resolved: AcField | null = null;
    try {
      const fields = await this.request<any[]>('/field');
      resolved = this.pickAcceptanceCriteriaField(Array.isArray(fields) ? fields : []);
    } catch {
      resolved = envId && /^customfield_\d+$/i.test(envId) ? { id: envId, format: 'adf' } : null;
    }

    JiraClient.acFieldByHost.set(key, resolved);
    return resolved;
  }

  private formatAcValue(text: string, field: AcField): unknown {
    return field.format === 'text' ? text : this.textToAdf(text);
  }

  private extractAcceptanceCriteriaValue(
    fields: Record<string, unknown>,
    rendered: Record<string, unknown>,
    acField: AcField | null,
    descriptionMarkdown: string | null,
  ): string | null {
    if (acField) {
      const renderedAc = this.htmlToMarkdown(rendered[acField.id] as string | undefined);
      const rawAc = this.extractTextFallback(fields[acField.id]);
      const fromField = renderedAc || rawAc;
      if (fromField?.trim()) return fromField.trim();
    }
    return JiraClient.extractAcceptanceCriteria(descriptionMarkdown);
  }

  private isMissingScreenField(err: unknown, fieldId: string): boolean {
    if (!(err instanceof AppError) || !err.details) return false;
    try {
      const parsed = JSON.parse(err.details);
      const msg = parsed?.errors?.[fieldId];
      return typeof msg === 'string' && /not on the appropriate screen|unknown/i.test(msg);
    } catch {
      return typeof err.details === 'string' && err.details.includes(fieldId) && /not on the appropriate screen/i.test(err.details);
    }
  }

  private static readonly AC_HEADING_RE = /\n{0,3}#{1,3}\s*Acceptance\s+Criteria\s*\n/i;

  private static extractAcceptanceCriteria(text: string | null): string | null {
    if (!text) return null;
    const match = JiraClient.AC_HEADING_RE.exec(text);
    if (!match) return null;
    const ac = text.slice(match.index + match[0].length).trim();
    return ac || null;
  }

  private static extractDescription(text: string | null): string | null {
    if (!text) return null;
    const match = JiraClient.AC_HEADING_RE.exec(text);
    if (!match) return text;
    const desc = text.slice(0, match.index).trim();
    return desc || null;
  }

  private static stripAcceptanceCriteriaSection(text: string): string {
    const match = JiraClient.AC_HEADING_RE.exec(text);
    if (!match) return text;
    return text.slice(0, match.index).trim();
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

  private static sharedTurndown: TurndownService | null = null;

  private static getTurndown(): TurndownService {
    if (JiraClient.sharedTurndown) return JiraClient.sharedTurndown;
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    td.addRule('jiraPanels', {
      filter: (node) => {
        const className = node.getAttribute?.('class') || '';
        return className.includes('panel') || node.tagName === 'AC:STRUCTURED-MACRO';
      },
      replacement: (_content, node) => {
        const textContent = node.textContent?.trim() || '';
        return textContent ? `\n\n> ${textContent.replace(/\n/g, '\n> ')}\n\n` : '';
      },
    });

    td.addRule('jiraCheckboxes', {
      filter: (node) => node.tagName === 'LI' && (node.getAttribute?.('class') || '').includes('task'),
      replacement: (content) => {
        const checked = content.includes('[x]') || content.includes('✓');
        return `- [${checked ? 'x' : ' '}] ${content.replace(/^\[[ x]\]\s*/, '').trim()}\n`;
      },
    });

    JiraClient.sharedTurndown = td;
    return td;
  }

  private htmlToMarkdown(html: string | null | undefined): string | null {
    if (!html || typeof html !== 'string') return null;
    const cleaned = html.trim();
    if (!cleaned) return null;

    try {
      const md = JiraClient.getTurndown().turndown(cleaned);
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
    return markdownToJiraAdf(text);
  }
}
