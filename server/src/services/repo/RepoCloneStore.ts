import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RepoService } from './RepoService.js';
import { AppError } from '../../middleware/errorHandler.js';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.resolve(__dirname, '../../../data/repos');
const STALE_MS = 10 * 60 * 1000; // pull if older than 10 min

export interface CloneResult {
  dir: string;
  stale: boolean;
}

interface CloneEntry {
  dir: string;
  lastPulled: number;
}

const cache = new Map<string, CloneEntry>();
const inFlight = new Map<string, Promise<CloneResult>>();

export class RepoCloneStore {
  static async ensureClone(
    repoUrl: string,
    token?: string,
  ): Promise<CloneResult> {
    const { provider, owner, repo } = RepoService.parseRepoUrl(repoUrl);
    const tokenFingerprint = token
      ? createHash('sha256').update(token).digest('hex').slice(0, 8)
      : 'anon';
    const key = `${provider}_${createHash('sha256').update(`${owner}/${repo}:${tokenFingerprint}`).digest('hex').slice(0, 16)}`;
    const repoDir = path.join(REPOS_DIR, key);

    const existing = cache.get(key);
    if (existing && Date.now() - existing.lastPulled < STALE_MS) {
      return { dir: existing.dir, stale: false };
    }

    if (inFlight.has(key)) {
      return inFlight.get(key)!;
    }

    const work = this.doCloneOrPull(key, repoDir, repoUrl, provider, token, existing);
    inFlight.set(key, work);
    try {
      return await work;
    } finally {
      inFlight.delete(key);
    }
  }

  private static async doCloneOrPull(
    key: string,
    repoDir: string,
    repoUrl: string,
    provider: string,
    token: string | undefined,
    existing: CloneEntry | undefined,
  ): Promise<CloneResult> {
    await fs.mkdir(REPOS_DIR, { recursive: true });

    const authedUrl = this.buildAuthUrl(repoUrl, provider, token);

    const exists = await fs.access(path.join(repoDir, '.git')).then(() => true).catch(() => false);

    let pullSucceeded = true;
    if (exists) {
      try {
        await exec('git', ['remote', 'set-url', 'origin', authedUrl], {
          cwd: repoDir,
          timeout: 10_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
      } catch { /* best-effort */ }
      try {
        await exec('git', ['pull', '--ff-only', '--depth', '1'], {
          cwd: repoDir,
          timeout: 60_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
      } catch (err) {
        pullSucceeded = false;
        console.warn(`[RepoCloneStore] git pull failed for ${key}:`, (err as Error).message);
      }
    } else {
      try {
        await exec('git', ['clone', '--depth', '1', authedUrl, repoDir], {
          timeout: 120_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
      } catch (err) {
        await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
        const msg = (err as Error).message || 'Unknown git clone error';
        const isAuth = /authentication|auth|403|401/i.test(msg);
        const isTimeout = /timed?\s*out|SIGTERM/i.test(msg);
        if (isAuth) {
          throw new AppError(401, 'REPO_AUTH_FAILED', 'Failed to clone repository — please check your access token.');
        }
        if (isTimeout) {
          throw new AppError(504, 'REPO_CLONE_TIMEOUT', 'Repository clone timed out. The repo may be too large or the server unreachable.');
        }
        throw new AppError(502, 'REPO_CLONE_FAILED', `Failed to clone repository: ${msg.slice(0, 200)}`);
      }
    }

    // Strip auth token from persisted .git/config
    if (token) {
      await exec('git', ['remote', 'set-url', 'origin', repoUrl], {
        cwd: repoDir,
        timeout: 10_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      }).catch(() => {});
    }

    cache.set(key, {
      dir: repoDir,
      lastPulled: pullSucceeded ? Date.now() : (existing?.lastPulled ?? 0),
    });
    return { dir: repoDir, stale: !pullSucceeded };
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
