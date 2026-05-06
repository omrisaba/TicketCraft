export type RepoProvider = 'github' | 'gitlab';

export interface RepoInfo {
  provider: RepoProvider;
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string | null;
  languages: Record<string, number>;
}

export interface RepoTreeEntry {
  path: string;
  type: 'blob' | 'tree';
}

export interface RepoContext {
  info: RepoInfo;
  tree: RepoTreeEntry[];
  readme: string | null;
  promptContext: string;
}

export interface RepoRequest {
  repoUrl: string;
}
