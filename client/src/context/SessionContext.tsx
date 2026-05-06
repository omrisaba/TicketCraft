import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { SessionCredentials, GeminiModel, HistoryEntry, AppConfig, RepoContext } from 'ticketcraft-shared';
import { updateApiModel, updateApiTemperature } from '../services/apiClient';

interface JiraUser {
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
}

interface SessionState {
  isActive: boolean;
  credentials: SessionCredentials | null;
  jiraUser: JiraUser | null;
  appConfig: AppConfig | null;
  history: HistoryEntry[];
  repoContext: RepoContext | null;
  geminiTemperature: number;
}

interface SessionContextValue extends SessionState {
  startSession: (creds: SessionCredentials, jiraUser: JiraUser) => void;
  endSession: () => void;
  setAppConfig: (config: AppConfig) => void;
  setGeminiModel: (model: GeminiModel) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  updateHistoryEntry: (ticketKey: string, update: Partial<HistoryEntry>) => void;
  setRepoContext: (ctx: RepoContext | null) => void;
  setGeminiTemperature: (temp: number) => void;
  sessionWarning: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const INITIAL_STATE: SessionState = {
  isActive: false,
  credentials: null,
  jiraUser: null,
  appConfig: null,
  history: [],
  repoContext: null,
  geminiTemperature: 0.3,
};

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const [sessionWarning, setSessionWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout>>(null);

  const endSession = useCallback(() => {
    setState((prev) => ({ ...INITIAL_STATE, appConfig: prev.appConfig }));
    setSessionWarning(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    setSessionWarning(false);
    if (state.isActive) {
      warningRef.current = setTimeout(() => setSessionWarning(true), INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);
      timeoutRef.current = setTimeout(endSession, INACTIVITY_TIMEOUT_MS);
    }
  }, [state.isActive, endSession]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetTimeout();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [resetTimeout]);

  useEffect(() => {
    const handleUnload = () => {
      setState((prev) => ({ ...INITIAL_STATE, appConfig: prev.appConfig }));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const setAppConfig = useCallback((config: AppConfig) => {
    updateApiTemperature(config.defaultTemperature);
    setState((prev) => ({ ...prev, appConfig: config, geminiTemperature: config.defaultTemperature }));
  }, []);

  const startSession = useCallback((creds: SessionCredentials, jiraUser: JiraUser) => {
    setState((prev) => ({
      ...prev,
      isActive: true,
      credentials: creds,
      jiraUser,
      history: [],
    }));
    setSessionWarning(false);
    warningRef.current = setTimeout(() => setSessionWarning(true), INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);
    timeoutRef.current = setTimeout(endSession, INACTIVITY_TIMEOUT_MS);
  }, [endSession]);

  const addHistoryEntry = useCallback((entry: HistoryEntry) => {
    setState((prev) => ({ ...prev, history: [...prev.history, entry] }));
  }, []);

  const updateHistoryEntry = useCallback((ticketKey: string, update: Partial<HistoryEntry>) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.map((h) =>
        h.ticketKey === ticketKey ? { ...h, ...update } : h,
      ),
    }));
  }, []);

  const setGeminiModel = useCallback((model: GeminiModel) => {
    updateApiModel(model);
    setState((prev) => ({
      ...prev,
      credentials: prev.credentials ? { ...prev.credentials, geminiModel: model } : null,
    }));
  }, []);

  const setRepoContext = useCallback((ctx: RepoContext | null) => {
    setState((prev) => ({ ...prev, repoContext: ctx }));
  }, []);

  const setGeminiTemperature = useCallback((temp: number) => {
    updateApiTemperature(temp);
    setState((prev) => ({ ...prev, geminiTemperature: temp }));
  }, []);

  return (
    <SessionContext.Provider
      value={{ ...state, startSession, endSession, setAppConfig, setGeminiModel, addHistoryEntry, updateHistoryEntry, setRepoContext, setGeminiTemperature, sessionWarning }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
