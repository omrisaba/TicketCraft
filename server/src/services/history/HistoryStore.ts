import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { HistorySnapshot, HistoryListItem } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.resolve(__dirname, '../../../data/history');
const MAX_SNAPSHOTS_PER_USER = 50;

export class HistoryStore {
  private static hashEmail(email: string): string {
    return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private static userDir(email: string): string {
    return path.join(HISTORY_DIR, this.hashEmail(email));
  }

  private static filePath(email: string, id: string): string {
    return path.join(this.userDir(email), `${id}.json`);
  }

  private static async ensureDir(email: string): Promise<void> {
    await fs.mkdir(this.userDir(email), { recursive: true });
  }

  static async save(email: string, snapshot: HistorySnapshot): Promise<void> {
    await this.ensureDir(email);
    await fs.writeFile(this.filePath(email, snapshot.id), JSON.stringify(snapshot), 'utf-8');
    await this.enforceLimit(email);
  }

  static async list(email: string): Promise<HistoryListItem[]> {
    await this.ensureDir(email);
    const dir = this.userDir(email);

    try {
      const files = await fs.readdir(dir);
      const items: HistoryListItem[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          const snap = JSON.parse(raw) as HistorySnapshot;
          items.push({
            id: snap.id,
            ticketKey: snap.ticketKey,
            ticketSummary: snap.ticketSummary,
            overallScore: snap.score?.overall ?? 0,
            originalScore: snap.originalScore,
            syncedAt: snap.syncedAt,
            savedAt: snap.savedAt,
            type: snap.type ?? 'improved',
          });
        } catch { /* skip corrupt files */ }
      }

      items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      return items;
    } catch {
      return [];
    }
  }

  static async load(email: string, id: string): Promise<HistorySnapshot | null> {
    try {
      const raw = await fs.readFile(this.filePath(email, id), 'utf-8');
      return JSON.parse(raw) as HistorySnapshot;
    } catch {
      return null;
    }
  }

  static async delete(email: string, id: string): Promise<void> {
    await fs.unlink(this.filePath(email, id)).catch(() => {});
  }

  static async updateSynced(
    email: string,
    id: string,
    syncedAt: string,
    finalScore?: { overall: number },
  ): Promise<void> {
    const snap = await this.load(email, id);
    if (snap) {
      snap.syncedAt = syncedAt;
      if (finalScore) {
        if (snap.originalScore === undefined) {
          snap.originalScore = snap.score.overall;
        }
        snap.score = { ...snap.score, overall: finalScore.overall };
      }
      await fs.writeFile(this.filePath(email, id), JSON.stringify(snap), 'utf-8');
    }
  }

  private static async enforceLimit(email: string): Promise<void> {
    const items = await this.list(email);
    if (items.length <= MAX_SNAPSHOTS_PER_USER) return;
    const toRemove = items.slice(MAX_SNAPSHOTS_PER_USER);
    for (const item of toRemove) {
      await this.delete(email, item.id);
    }
  }
}
