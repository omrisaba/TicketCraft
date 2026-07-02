/**
 * Lightweight Streamable HTTP MCP client.
 *
 * Speaks JSON-RPC 2.0 over HTTP POST to a single MCP endpoint URL.
 * Covers only the subset needed by TicketCraft:
 *   1. tools/list  — discover available tools
 *   2. tools/call  — invoke a tool by name with arguments
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: string; text?: string; [k: string]: unknown }[];
  isError?: boolean;
}

export class McpClient {
  private url: string;
  private authToken: string | undefined;
  private sessionId: string | null = null;

  constructor(url: string, authToken?: string) {
    this.url = url;
    this.authToken = authToken;
  }

  private async rpc<T>(method: string, params: Record<string, unknown> = {}, isNotification = false): Promise<T> {
    const reqBody: Record<string, unknown> = {
      jsonrpc: '2.0',
      method,
      params,
    };
    if (!isNotification) reqBody.id = crypto.randomUUID();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const resp = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(30_000),
    });

    const sid = resp.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (isNotification) {
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`MCP ${method} failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
      }
      await resp.text().catch(() => {});
      return undefined as T;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MCP ${method} failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    let json: any;

    if (contentType.includes('text/event-stream')) {
      json = await this.parseSSE(await resp.text(), reqBody.id as string);
    } else {
      json = await resp.json();
    }

    if (json.error) {
      throw new Error(`MCP ${method} error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result as T;
  }

  /**
   * Parse an SSE stream body and extract the JSON-RPC message matching
   * the given request `id` from `data:` lines in `event: message` blocks.
   * Falls back to the last parseable JSON if no id match is found.
   */
  private async parseSSE(text: string, requestId?: string): Promise<any> {
    const events = text.split(/\r?\n\r?\n/);
    let matchedJson: any = null;
    let lastJson: any = null;

    for (const event of events) {
      const dataLines: string[] = [];
      let eventType = 'message';
      for (const line of event.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (eventType !== 'message') continue;
      if (dataLines.length === 0) continue;
      const payload = dataLines.join('\n').trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        lastJson = parsed;
        if (requestId && parsed.id === requestId) {
          matchedJson = parsed;
        }
      } catch {
        // Keep scanning; some events may not be JSON-RPC payloads.
      }
    }

    const result = matchedJson || lastJson;
    if (!result) {
      throw new Error('SSE response contained no data lines');
    }

    return result;
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'TicketCraft', version: '1.0.0' },
    });
    await this.rpc('notifications/initialized', {}, true);
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc<{ tools: McpTool[] }>('tools/list');
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    return this.rpc<McpToolResult>('tools/call', { name, arguments: args });
  }
}
