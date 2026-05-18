import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { UsageEvent, UsageEventType, UsageStats, UsageUserSummary } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = path.resolve(__dirname, '../../../data/usage');
const FILE_PREFIX = 'usage-';
const RETENTION_MONTHS = 12;

function ensureDir(): void {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function filePathForMonth(key: string): string {
  return path.join(USAGE_DIR, `${FILE_PREFIX}${key}.ndjson`);
}

function retentionMonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < RETENTION_MONTHS; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

function pruneOldFiles(): void {
  ensureDir();
  const kept = new Set(retentionMonthKeys());
  const re = new RegExp(`^${FILE_PREFIX}(\\d{4}-\\d{2})\\.ndjson$`);
  try {
    for (const name of fs.readdirSync(USAGE_DIR)) {
      const m = name.match(re);
      if (m && !kept.has(m[1])) {
        fs.unlinkSync(path.join(USAGE_DIR, name));
      }
    }
  } catch { /* ignore */ }
}

function parseFile(filePath: string): UsageEvent[] {
  const out: UsageEvent[] = [];
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
      const obj = JSON.parse(t) as UsageEvent;
      if (obj?.id && obj.timestamp && obj.email && obj.event) {
        out.push(obj);
      }
    } catch { /* skip corrupt line */ }
  }
  return out;
}

function readAll(): UsageEvent[] {
  ensureDir();
  pruneOldFiles();
  const merged: UsageEvent[] = [];
  for (const key of retentionMonthKeys()) {
    merged.push(...parseFile(filePathForMonth(key)));
  }
  return merged;
}

class UsageTrackerSingleton {
  record(email: string, event: UsageEventType, ticketKey?: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const id = `usage_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const entry: UsageEvent = {
      id,
      timestamp,
      email: email.toLowerCase(),
      event,
      ...(ticketKey && { ticketKey }),
      ...(meta && { meta }),
    };
    ensureDir();
    pruneOldFiles();
    const key = monthKey(new Date(timestamp));
    const fp = filePathForMonth(key);
    fs.appendFileSync(fp, `${JSON.stringify(entry)}\n`, 'utf-8');
  }

  query(): UsageStats {
    const events = readAll();
    const userMap = new Map<string, UsageUserSummary>();

    for (const e of events) {
      let user = userMap.get(e.email);
      if (!user) {
        user = {
          email: e.email,
          lastSeen: e.timestamp,
          loginCount: 0,
          improvements: 0,
          compositions: 0,
          syncsToJira: 0,
          createsInJira: 0,
        };
        userMap.set(e.email, user);
      }

      if (e.timestamp > user.lastSeen) {
        user.lastSeen = e.timestamp;
      }

      switch (e.event) {
        case 'login': user.loginCount++; break;
        case 'improve': user.improvements++; break;
        case 'compose': user.compositions++; break;
        case 'sync_to_jira': user.syncsToJira++; break;
        case 'create_in_jira': user.createsInJira++; break;
      }
    }

    const uniqueUsers = [...userMap.values()].sort(
      (a, b) => (a.lastSeen < b.lastSeen ? 1 : -1),
    );

    const totals = {
      logins: 0,
      improvements: 0,
      compositions: 0,
      syncsToJira: 0,
      createsInJira: 0,
    };
    for (const u of uniqueUsers) {
      totals.logins += u.loginCount;
      totals.improvements += u.improvements;
      totals.compositions += u.compositions;
      totals.syncsToJira += u.syncsToJira;
      totals.createsInJira += u.createsInJira;
    }

    return { uniqueUsers, totals };
  }
}

export const usageTracker = new UsageTrackerSingleton();
