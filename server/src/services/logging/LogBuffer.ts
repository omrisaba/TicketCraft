import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type LogCategory = 'llm' | 'mcp';

export interface LogEntry {
  id: string;
  category: LogCategory;
  timestamp: string;
  operation: string;
  model?: string;
  temperature?: number;
  provider?: string;
  tool?: string;
  promptLength?: number;
  responseLength?: number;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface LogStats {
  total: number;
  llm: number;
  mcp: number;
  llmErrors: number;
  mcpErrors: number;
  /** UTC calendar days, newest first; counts for entries in retention window */
  byDate: { date: string; total: number; llm: number; mcp: number }[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../../../data/logs');
/** Number of UTC calendar days to retain (today + previous N-1 days). */
export const LOG_RETENTION_DAYS = 7;
const FILE_PREFIX = 'logs-';
const DEFAULT_LIST_LIMIT = 10_000;

function ensureLogsDir(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function filePathForDay(dayKey: string): string {
  return path.join(LOGS_DIR, `${FILE_PREFIX}${dayKey}.ndjson`);
}

/** UTC midnight of the oldest calendar day we still keep. */
function oldestKeptDayStart(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (LOG_RETENTION_DAYS - 1),
    ),
  );
}

function pruneOldFiles(): void {
  ensureLogsDir();
  const re = new RegExp(`^${FILE_PREFIX}(\\d{4}-\\d{2}-\\d{2})\\.ndjson$`);
  const oldest = oldestKeptDayStart();
  try {
    for (const name of fs.readdirSync(LOGS_DIR)) {
      const m = name.match(re);
      if (!m) continue;
      const fileDay = new Date(`${m[1]}T00:00:00.000Z`);
      if (fileDay.getTime() < oldest.getTime()) {
        fs.unlinkSync(path.join(LOGS_DIR, name));
      }
    }
  } catch {
    /* ignore */
  }
}

function listRetentionDayKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < LOG_RETENTION_DAYS; i++) {
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - i,
      ),
    );
    keys.push(utcDateKey(d));
  }
  return keys;
}

function isValidDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && listRetentionDayKeys().includes(s);
}

function parseFile(filePath: string): LogEntry[] {
  const out: LogEntry[] = [];
  if (!fs.existsSync(filePath)) return out;
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as LogEntry;
      if (obj?.id && obj.timestamp && (obj.category === 'llm' || obj.category === 'mcp')) {
        out.push(obj);
      }
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

function readRetention(onlyDay?: string): LogEntry[] {
  ensureLogsDir();
  const dayKeys = onlyDay && isValidDayKey(onlyDay)
    ? [onlyDay]
    : listRetentionDayKeys();
  const merged: LogEntry[] = [];
  for (const key of dayKeys) {
    merged.push(...parseFile(filePathForDay(key)));
  }
  return merged;
}

function computeStats(entries: LogEntry[]): LogStats {
  let llmCount = 0;
  let mcpCount = 0;
  let llmErrors = 0;
  let mcpErrors = 0;
  const byDayMap = new Map<string, { total: number; llm: number; mcp: number }>();
  for (const e of entries) {
    const isLlm = e.category === 'llm';
    if (isLlm) {
      llmCount++;
      if (!e.success) llmErrors++;
    } else {
      mcpCount++;
      if (!e.success) mcpErrors++;
    }
    const dk = e.timestamp.slice(0, 10);
    let cur = byDayMap.get(dk);
    if (!cur) { cur = { total: 0, llm: 0, mcp: 0 }; byDayMap.set(dk, cur); }
    cur.total++;
    if (isLlm) cur.llm++; else cur.mcp++;
  }
  const byDate = [...byDayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, v]) => ({ date, ...v }));
  return {
    total: entries.length,
    llm: llmCount,
    mcp: mcpCount,
    llmErrors,
    mcpErrors,
    byDate,
  };
}

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

class LogBufferSingleton {
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private dirReady = false;

  constructor() {
    try { pruneOldFiles(); } catch { /* best-effort on startup */ }
    this.pruneTimer = setInterval(() => {
      try { pruneOldFiles(); } catch { /* best-effort */ }
    }, PRUNE_INTERVAL_MS);
    this.pruneTimer.unref?.();
  }

  add(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    try {
      const timestamp = new Date().toISOString();
      const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const full: LogEntry = { ...entry, id, timestamp };
      if (!this.dirReady) {
        ensureLogsDir();
        this.dirReady = true;
      }
      const dayKey = utcDateKey(new Date(timestamp));
      const fp = filePathForDay(dayKey);
      fs.appendFileSync(fp, `${JSON.stringify(full)}\n`, 'utf-8');
    } catch (err) {
      console.warn('[LOG_BUFFER] Failed to write log entry:', (err as Error).message);
    }
  }

  /**
   * Load entries in the retention window (single read), then filter/sort/limit.
   */
  query(opts?: {
    category?: LogCategory;
    limit?: number;
    date?: string;
  }): { entries: LogEntry[]; stats: LogStats } {
    try {
      const fullWindow = readRetention();
      const stats = computeStats(fullWindow);
      let rows = fullWindow;
      if (opts?.date) {
        rows = rows.filter((e) => e.timestamp.startsWith(opts.date!));
      }
      if (opts?.category) {
        rows = rows.filter((e) => e.category === opts.category);
      }
      rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      const lim = Math.min(
        opts?.limit && opts.limit > 0 ? opts.limit : DEFAULT_LIST_LIMIT,
        50_000,
      );
      return { entries: rows.slice(0, lim), stats };
    } catch (err) {
      console.warn('[LOG_BUFFER] Failed to query logs:', (err as Error).message);
      return {
        entries: [],
        stats: { total: 0, llm: 0, mcp: 0, llmErrors: 0, mcpErrors: 0, byDate: [] },
      };
    }
  }

  /** @deprecated Prefer query(); kept for tests */
  list(opts?: { category?: LogCategory; limit?: number }): LogEntry[] {
    return this.query(opts).entries;
  }

  stats(): LogStats {
    return this.query().stats;
  }

  clear(): void {
    ensureLogsDir();
    try {
      for (const name of fs.readdirSync(LOGS_DIR)) {
        if (name.startsWith(FILE_PREFIX) && name.endsWith('.ndjson')) {
          fs.unlinkSync(path.join(LOGS_DIR, name));
        }
      }
    } catch {
      /* ignore */
    }
  }
}

export const logBuffer = new LogBufferSingleton();
