import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AdminSettings } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, '../../../data/admin-settings.json');

const DEFAULTS: AdminSettings = {
  defaultModel: 'gemini-3.1-pro-preview',
  defaultTemperature: 0.3,
  scanJql: 'reporter = currentUser() AND status = "Refinement" AND labels = "readyForTicketCraftRefinement"',
  githubMcpUrl: '',
  gitlabMcpUrl: '',
  mcpMaxRounds: 5,
  mcpMaxToolCalls: 10,
  cursorEnabled: false,
  cursorApiKey: '',
  cursorModel: 'auto',
  cursorMaxConcurrent: 8,
};

export class AdminStore {
  static async load(): Promise<AdminSettings> {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
      const saved = JSON.parse(raw) as Partial<AdminSettings>;
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  static async save(settings: AdminSettings): Promise<void> {
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  }
}
