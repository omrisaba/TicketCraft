import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DraftData, DraftMetadata } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = path.resolve(__dirname, '../../../data/drafts');
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class DraftStore {
  private static initialized = false;

  private static async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(DRAFTS_DIR, { recursive: true });
    this.initialized = true;
  }

  static hashEmail(email: string): string {
    return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private static filePath(emailHash: string): string {
    return path.join(DRAFTS_DIR, `${emailHash}.json`);
  }

  static async save(email: string, draft: DraftData): Promise<void> {
    await this.ensureDir();
    const hash = this.hashEmail(email);
    const data = JSON.stringify(draft, null, 2);
    await fs.writeFile(this.filePath(hash), data, 'utf-8');
  }

  static async load(email: string): Promise<DraftData | null> {
    await this.ensureDir();
    const hash = this.hashEmail(email);
    const fp = this.filePath(hash);

    try {
      const raw = await fs.readFile(fp, 'utf-8');
      const draft = JSON.parse(raw) as DraftData;

      const savedAt = new Date(draft.savedAt).getTime();
      if (Date.now() - savedAt > DRAFT_TTL_MS) {
        await fs.unlink(fp).catch(() => {});
        return null;
      }

      return draft;
    } catch {
      return null;
    }
  }

  static async getMetadata(email: string): Promise<DraftMetadata | null> {
    const draft = await this.load(email);
    if (!draft) return null;

    return {
      ticketKey: draft.ticketKey,
      ticketSummary: draft.ticket?.summary || draft.ticketKey,
      step: draft.step,
      savedAt: draft.savedAt,
    };
  }

  static async delete(email: string): Promise<void> {
    const hash = this.hashEmail(email);
    await fs.unlink(this.filePath(hash)).catch(() => {});
  }

  static async cleanup(): Promise<number> {
    await this.ensureDir();
    let removed = 0;

    try {
      const files = await fs.readdir(DRAFTS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const fp = path.join(DRAFTS_DIR, file);
        try {
          const raw = await fs.readFile(fp, 'utf-8');
          const draft = JSON.parse(raw) as DraftData;
          const savedAt = new Date(draft.savedAt).getTime();
          if (Date.now() - savedAt > DRAFT_TTL_MS) {
            await fs.unlink(fp);
            removed++;
          }
        } catch {
          await fs.unlink(fp).catch(() => {});
          removed++;
        }
      }
    } catch { /* dir doesn't exist yet */ }

    return removed;
  }
}
