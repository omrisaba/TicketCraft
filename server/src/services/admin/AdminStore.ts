import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AdminSettings } from 'ticketcraft-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, '../../../data/admin-settings.json');

const DEFAULTS: AdminSettings = {
  defaultModel: 'gemini-3.5-flash',
  defaultTemperature: 0.3,
  scanJql: 'project = "MYPROJECT" AND status = "To Do" ORDER BY created DESC',
  githubMcpUrl: '',
  gitlabMcpUrl: '',
  mcpMaxRounds: 5,
  mcpMaxToolCalls: 10,
  cursorEnabled: true,
  cursorModel: 'auto',
  cursorMaxConcurrent: 8,
};

const CACHE_TTL_MS = 60_000;
let cachedSettings: AdminSettings | null = null;
let cacheTime = 0;

export class AdminStore {
  static async load(): Promise<AdminSettings> {
    if (cachedSettings && Date.now() - cacheTime < CACHE_TTL_MS) {
      return cachedSettings;
    }
    try {
      const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
      const saved = JSON.parse(raw) as Partial<AdminSettings>;
      cachedSettings = { ...DEFAULTS, ...saved };
    } catch {
      cachedSettings = { ...DEFAULTS };
    }
    cacheTime = Date.now();
    return cachedSettings;
  }

  static async save(settings: AdminSettings): Promise<void> {
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    cachedSettings = settings;
    cacheTime = Date.now();
  }
}
