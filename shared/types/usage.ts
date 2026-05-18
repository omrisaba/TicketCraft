export type UsageEventType = 'login' | 'improve' | 'compose' | 'sync_to_jira' | 'create_in_jira';

export interface UsageEvent {
  id: string;
  timestamp: string;
  email: string;
  event: UsageEventType;
  ticketKey?: string;
  meta?: Record<string, unknown>;
}

export interface UsageUserSummary {
  email: string;
  lastSeen: string;
  loginCount: number;
  improvements: number;
  compositions: number;
  syncsToJira: number;
  createsInJira: number;
}

export interface UsageStats {
  uniqueUsers: UsageUserSummary[];
  totals: {
    logins: number;
    improvements: number;
    compositions: number;
    syncsToJira: number;
    createsInJira: number;
  };
}
