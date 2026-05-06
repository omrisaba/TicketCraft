import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AutomationResult, AutomationPendingItem } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTOMATION_DIR = path.resolve(__dirname, '../../../data/automation');

interface UserProfile {
  repoUrl: string | null;
}

export class AutomationStore {
  static hashEmail(email: string): string {
    return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private static userDir(emailHash: string): string {
    return path.join(AUTOMATION_DIR, emailHash);
  }

  private static async ensureUserDir(emailHash: string): Promise<void> {
    await fs.mkdir(this.userDir(emailHash), { recursive: true });
  }

  private static filePath(emailHash: string, ticketKey: string): string {
    return path.join(this.userDir(emailHash), `${ticketKey}.json`);
  }

  private static profilePath(emailHash: string): string {
    return path.join(this.userDir(emailHash), '_profile.json');
  }

  static async saveProfile(email: string, profile: UserProfile): Promise<void> {
    const hash = this.hashEmail(email);
    await this.ensureUserDir(hash);
    await fs.writeFile(this.profilePath(hash), JSON.stringify(profile, null, 2), 'utf-8');
  }

  static async loadProfile(email: string): Promise<UserProfile> {
    const hash = this.hashEmail(email);
    try {
      const raw = await fs.readFile(this.profilePath(hash), 'utf-8');
      return JSON.parse(raw) as UserProfile;
    } catch {
      return { repoUrl: null };
    }
  }

  static async save(email: string, result: AutomationResult): Promise<void> {
    const hash = this.hashEmail(email);
    await this.ensureUserDir(hash);
    await fs.writeFile(this.filePath(hash, result.ticketKey), JSON.stringify(result, null, 2), 'utf-8');
  }

  static async load(email: string, ticketKey: string): Promise<AutomationResult | null> {
    const hash = this.hashEmail(email);
    try {
      const raw = await fs.readFile(this.filePath(hash, ticketKey), 'utf-8');
      return JSON.parse(raw) as AutomationResult;
    } catch {
      return null;
    }
  }

  static async delete(email: string, ticketKey: string): Promise<void> {
    const hash = this.hashEmail(email);
    await fs.unlink(this.filePath(hash, ticketKey)).catch(() => {});
  }

  static async exists(email: string, ticketKey: string): Promise<boolean> {
    const hash = this.hashEmail(email);
    try {
      await fs.access(this.filePath(hash, ticketKey));
      return true;
    } catch {
      return false;
    }
  }

  static async listPending(email: string): Promise<AutomationPendingItem[]> {
    const hash = this.hashEmail(email);
    const dir = this.userDir(hash);
    const items: AutomationPendingItem[] = [];

    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json') || file === '_profile.json') continue;
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          const result = JSON.parse(raw) as AutomationResult;
          items.push({
            ticketKey: result.ticketKey,
            summary: result.ticket.summary,
            issueType: result.ticket.issueType,
            reporterName: result.reporterName,
            overallScore: result.score.overall,
            processedAt: result.processedAt,
          });
        } catch { /* skip corrupted files */ }
      }
    } catch { /* dir doesn't exist yet */ }

    items.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());
    return items;
  }
}
