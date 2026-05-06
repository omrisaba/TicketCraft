import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RepoService } from './RepoService.js';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.resolve(__dirname, '../../../data/repos');
const STALE_MS = 10 * 60 * 1000; // pull if older than 10 min

interface CloneEntry {
  dir: string;
  lastPulled: number;
}

const cache = new Map<string, CloneEntry>();

export class RepoCloneStore {
  static async ensureClone(
    repoUrl: string,
    token?: string,
  ): Promise<string> {
    const { provider, owner, repo } = RepoService.parseRepoUrl(repoUrl);
    const key = `${owner}-${repo}`;
    const repoDir = path.join(REPOS_DIR, key);

    const existing = cache.get(key);
    if (existing && Date.now() - existing.lastPulled < STALE_MS) {
      return existing.dir;
    }

    await fs.mkdir(REPOS_DIR, { recursive: true });

    const authedUrl = this.buildAuthUrl(repoUrl, provider, token);

    const exists = await fs.access(path.join(repoDir, '.git')).then(() => true).catch(() => false);

    if (exists) {
      try {
        await exec('git', ['pull', '--ff-only', '--depth', '1'], {
          cwd: repoDir,
          timeout: 60_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
      } catch {
        // pull failed — stale clone is still usable
      }
    } else {
      await exec('git', ['clone', '--depth', '1', authedUrl, repoDir], {
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    }

    cache.set(key, { dir: repoDir, lastPulled: Date.now() });
    return repoDir;
  }

  private static buildAuthUrl(repoUrl: string, provider: string, token?: string): string {
    if (!token) return repoUrl;
    try {
      const url = new URL(repoUrl);
      if (provider === 'github') {
        url.username = 'x-access-token';
        url.password = token;
      } else if (provider === 'gitlab') {
        url.username = 'oauth2';
        url.password = token;
      }
      return url.toString();
    } catch {
      return repoUrl;
    }
  }
}
