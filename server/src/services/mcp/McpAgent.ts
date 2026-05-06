/**
 * Agentic loop that lets Gemini decide which MCP tools to call
 * in order to gather deeper repo context for a Jira ticket.
 *
 * Flow per ticket evaluation:
 *   1. Build a prompt with the ticket summary, connected repo info,
 *      and the available MCP tools (schemas).
 *   2. Ask Gemini which tool to call (+ args). Gemini responds with JSON.
 *   3. Execute the tool via McpClient, append the result, loop.
 *   4. After max rounds or when Gemini says "done", return all
 *      gathered context as a single string for the scoring/improve prompts.
 */

import type { Ticket, McpUsageStats, McpToolCallInfo } from 'ticketcraft-shared';
import { McpClient, type McpTool } from './McpClient.js';
import { logBuffer } from '../logging/LogBuffer.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface McpAgentConfig {
  geminiApiKey: string;
  geminiModel: string;
  temperature: number;
  maxRounds: number;
  maxToolCalls: number;
  repoOwner: string;
  repoName: string;
  authToken?: string;
}

interface ToolCallDecision {
  done: boolean;
  tool?: string;
  arguments?: Record<string, unknown>;
  reasoning?: string;
}

export class McpAgent {
  private config: McpAgentConfig;
  private client: McpClient;

  constructor(mcpUrl: string, config: McpAgentConfig) {
    this.config = config;
    this.client = new McpClient(mcpUrl, config.authToken);
  }

  async gatherContext(ticket: Ticket): Promise<{ context: string; stats: McpUsageStats }> {
    const startTime = Date.now();
    const initStart = Date.now();
    await this.client.initialize();
    const tools = await this.client.listTools();
    logBuffer.add({ category: 'mcp', operation: 'initialize', provider: 'github', durationMs: Date.now() - initStart, success: true, meta: { toolCount: tools.length } });

    const emptyStats = (elapsed: number): McpUsageStats => ({
      used: false,
      provider: 'github',
      toolsAvailable: tools.length,
      roundsUsed: 0,
      toolCallsMade: 0,
      elapsedMs: elapsed,
      calls: [],
    });

    if (tools.length === 0) {
      return { context: '', stats: emptyStats(Date.now() - startTime) };
    }

    const contextParts: string[] = [];
    const callLog: McpToolCallInfo[] = [];
    let totalCalls = 0;
    let roundsUsed = 0;

    for (let round = 0; round < this.config.maxRounds; round++) {
      if (totalCalls >= this.config.maxToolCalls) break;
      roundsUsed++;

      const decision = await this.askGemini(ticket, tools, contextParts);

      if (decision.done || !decision.tool) break;

      const toolName = decision.tool;
      const toolArgs = this.injectRepoDefaults(decision.arguments || {});

      const callStart = Date.now();
      try {
        const result = await this.client.callTool(toolName, toolArgs);
        totalCalls++;
        const callDuration = Date.now() - callStart;

        const text = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('\n');

        const truncated = text.length > 12_000 ? text.slice(0, 12_000) + '\n... (truncated)' : text;
        contextParts.push(`### Tool: ${toolName}\nArgs: ${JSON.stringify(toolArgs)}\n\n${truncated}`);
        callLog.push({ tool: toolName, args: toolArgs, success: true, reasoning: decision.reasoning });

        logBuffer.add({ category: 'mcp', operation: 'tools/call', tool: toolName, provider: 'github', durationMs: callDuration, success: true, meta: { args: toolArgs, responseLength: text.length, reasoning: decision.reasoning } });
      } catch (err) {
        const callDuration = Date.now() - callStart;
        contextParts.push(`### Tool: ${toolName} — ERROR: ${(err as Error).message}`);
        callLog.push({ tool: toolName, args: toolArgs, success: false, reasoning: decision.reasoning });
        totalCalls++;

        logBuffer.add({ category: 'mcp', operation: 'tools/call', tool: toolName, provider: 'github', durationMs: callDuration, success: false, error: (err as Error).message, meta: { args: toolArgs, reasoning: decision.reasoning } });
      }
    }

    const elapsedMs = Date.now() - startTime;

    if (contextParts.length === 0) {
      return { context: '', stats: { ...emptyStats(elapsedMs), roundsUsed } };
    }

    const context = `\n\n---\n## Additional Repository Context (fetched via MCP)\n\n${contextParts.join('\n\n')}`;
    const stats: McpUsageStats = {
      used: true,
      provider: 'github',
      toolsAvailable: tools.length,
      roundsUsed,
      toolCallsMade: totalCalls,
      elapsedMs,
      calls: callLog,
    };

    return { context, stats };
  }

  private injectRepoDefaults(args: Record<string, unknown>): Record<string, unknown> {
    const out = { ...args };
    if (!out.owner && !out.repo_owner) out.owner = this.config.repoOwner;
    if (!out.repo && !out.repo_name) out.repo = this.config.repoName;
    return out;
  }

  private async askGemini(
    ticket: Ticket,
    tools: McpTool[],
    gatheredSoFar: string[],
  ): Promise<ToolCallDecision> {
    const toolDescriptions = tools
      .map((t) => `- **${t.name}**: ${t.description || '(no description)'}\n  Input schema: ${JSON.stringify(t.inputSchema || {})}`)
      .join('\n');

    const gathered = gatheredSoFar.length > 0
      ? `\n\nContext already gathered:\n${gatheredSoFar.join('\n---\n')}`
      : '';

    const prompt = `You are an assistant that fetches relevant code & documentation from a Git repository
to help improve a Jira ticket. You have access to MCP tools listed below.

## Jira Ticket
- Key: ${ticket.key}
- Summary: ${ticket.summary}
- Description (first 2000 chars): ${(ticket.description || '').slice(0, 2000)}
- Type: ${ticket.issueType || 'unknown'}

## Repository
- Owner: ${this.config.repoOwner}
- Repo: ${this.config.repoName}

## Available MCP Tools
${toolDescriptions}
${gathered}

## Instructions
Decide the NEXT tool call to fetch relevant context. Think about:
- Relevant source files, configs, or docs related to this ticket
- README or CONTRIBUTING guides
- Directory structures that relate to the ticket scope

Respond with a JSON object:
{
  "done": false,
  "tool": "<tool_name>",
  "arguments": { ... },
  "reasoning": "why this tool call"
}

If you already have enough context or no useful tool remains, respond:
{ "done": true, "reasoning": "..." }`;

    const url = `${GEMINI_API_BASE}/models/${this.config.geminiModel}:generateContent?key=${this.config.geminiApiKey}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    const agentLlmStart = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      logBuffer.add({ category: 'llm', operation: 'mcpAgentDecision', model: this.config.geminiModel, temperature: this.config.temperature, promptLength: prompt.length, durationMs: Date.now() - agentLlmStart, success: false, error: `HTTP ${resp.status}` });
      return { done: true, reasoning: 'Gemini API error during agentic loop' };
    }

    const json = await resp.json() as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logBuffer.add({ category: 'llm', operation: 'mcpAgentDecision', model: this.config.geminiModel, temperature: this.config.temperature, promptLength: prompt.length, responseLength: text.length, durationMs: Date.now() - agentLlmStart, success: true });

    try {
      return JSON.parse(text) as ToolCallDecision;
    } catch {
      return { done: true, reasoning: 'Could not parse Gemini tool-call response' };
    }
  }
}
