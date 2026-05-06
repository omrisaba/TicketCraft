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
    if (!isNotification) reqBody.id = Date.now();

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
    });

    const sid = resp.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (isNotification) {
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
      json = await this.parseSSE(await resp.text());
    } else {
      json = await resp.json();
    }

    if (json.error) {
      throw new Error(`MCP ${method} error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result as T;
  }

  /**
   * Parse an SSE stream body and extract the last JSON-RPC message
   * from `data:` lines in `event: message` blocks.
   */
  private async parseSSE(text: string): Promise<any> {
    const lines = text.split('\n');
    let lastData: string | null = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        lastData = line.slice(6);
      }
    }

    if (!lastData) {
      throw new Error('SSE response contained no data lines');
    }

    return JSON.parse(lastData);
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
