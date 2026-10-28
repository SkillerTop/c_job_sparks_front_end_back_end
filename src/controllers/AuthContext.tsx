import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AuthAccessState,
  AccessApprovalEmployeeInput,
  AuthAccount,
  AuthAccountStatus,
  AuthUser,
  LoginInput,
  RegistrationInput,
} from '@/models/auth';
import { AUTH_CHANGE_EVENT, AUTH_STATE_STORAGE_KEY, authService } from '@/services/authService';
import { sessionRevalidationDelay } from '@/utils/sessionRevalidation';

interface AuthContextValue extends AuthAccessState {
  user: AuthUser | null;
  registrationAccount: AuthAccount | null;
  loading: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<AuthAccountStatus>;
  register: (input: RegistrationInput) => Promise<AuthAccount>;
  logout: () => void;
  clearRegistrationView: () => void;
  reviewRegistration: (
    accountId: string,
    decision: Extract<AuthAccountStatus, 'Approved' | 'Rejected'>,
    reason?: string,
    employee?: AccessApprovalEmployeeInput,
  ) => Promise<AuthAccount>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_REVALIDATION_STALE_MS = 5 * 60_000;
const AUTH_REVALIDATION_DEDUP_MS = 1_000;

const sameUser = (current: AuthUser | null, next: AuthUser | null) =>
  current === next || Boolean(current && next &&
    current.accountId === next.accountId &&
    current.employeeId === next.employeeId &&
    current.email === next.email &&
    current.name === next.name &&
    current.initials === next.initials &&
    current.title === next.title &&
    current.departmentId === next.departmentId &&
    current.role === next.role &&
    current.authProvider === next.authProvider);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [registrationAccount, setRegistrationAccount] = useState<AuthAccount | null>(null);
  const [accessState, setAccessState] = useState<AuthAccessState>({ accounts: [], auditEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const authenticatedUserRef = useRef<AuthUser | null>(null);
  const lastSuccessfulRefreshAt = useRef(0);
  const lastBackgroundRevalidationAt = useRef(0);

  const refreshAuth = useCallback(async () => {
    const requestId = ++refreshGeneration.current;
    try {
      await authService.initialize();
      const nextUser = await authService.restoreSession();
      const [nextAccess, nextRegistration] = await Promise.all([
        nextUser?.role === 'Administrator'
          ? authService.getAccessState()
          : Promise.resolve({ accounts: [], auditEvents: [] }),
        nextUser ? Promise.resolve(null) : authService.getLastRegistration(),
      ]);
      if (requestId !== refreshGeneration.current) return;
      setUser((current) => {
        const stableUser = sameUser(current, nextUser) ? current : nextUser;
        authenticatedUserRef.current = stableUser;
        return stableUser;
      });
      setAccessState(nextAccess);
      setRegistrationAccount(nextRegistration);
      setError(null);
      lastSuccessfulRefreshAt.current = Date.now();
    } catch (caught) {
      if (requestId !== refreshGeneration.current) return;
      // A temporary network failure during focus/visibility revalidation must
      // not tear down an otherwise valid workspace. An expired session is
      // represented by restoreSession() as `null` in the successful branch.
      if (!authenticatedUserRef.current)
        setError(caught instanceof Error ? caught.message : 'Could not prepare sign-in.');
    } finally {
      if (requestId === refreshGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
    const sync = () => void refreshAuth();
    const syncStorage = (event: StorageEvent) => {
      if (event.key === AUTH_STATE_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener('storage', syncStorage);
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
    };
  }, [refreshAuth]);

  const authenticatedAccountId = user?.accountId ?? null;
  useEffect(() => {
    if (!authenticatedAccountId) return;
    const revalidateIfStale = () => {
      const now = Date.now();
      if (now - lastSuccessfulRefreshAt.current < AUTH_REVALIDATION_STALE_MS) return;
      if (now - lastBackgroundRevalidationAt.current < AUTH_REVALIDATION_DEDUP_MS) return;
      lastBackgroundRevalidationAt.current = now;
      void refreshAuth();
    };
    const expiry = authService.getSessionExpiry();
    const delay = sessionRevalidationDelay(expiry);
    const timeout = delay === null ? undefined : window.setTimeout(() => void refreshAuth(), delay);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') revalidateIfStale();
    };
    window.addEventListener('focus', revalidateIfStale);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener('focus', revalidateIfStale);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authenticatedAccountId, refreshAuth]);

  const login = useCallback(async (input: LoginInput) => {
    const account = await authService.login(input);
    await refreshAuth();
    return account.status;
  }, [refreshAuth]);

  const register = useCallback(async (input: RegistrationInput) => {
    const account = await authService.register(input);
    await refreshAuth();
    return account;
  }, [refreshAuth]);

  const logout = useCallback(() => {
    refreshGeneration.current += 1;
    authenticatedUserRef.current = null;
    lastSuccessfulRefreshAt.current = 0;
    lastBackgroundRevalidationAt.current = 0;
    authService.logout();
    setUser(null);
    setAccessState({ accounts: [], auditEvents: [] });
    setError(null);
  }, []);

  const clearRegistrationView = useCallback(() => {
    refreshGeneration.current += 1;
    authService.clearRegistrationView();
    setRegistrationAccount(null);
  }, []);

  const reviewRegistration: AuthContextValue['reviewRegistration'] = useCallback(async (accountId, decision, reason, employee) => {
    const account = await authService.reviewRegistration(accountId, decision, reason, employee);
    await refreshAuth();
    return account;
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...accessState,
      user,
      registrationAccount,
      loading,
      error,
      login,
      register,
      logout,
      clearRegistrationView,
      reviewRegistration,
      refreshAuth,
    }),
    [accessState, user, registrationAccount, loading, error, login, register, logout, clearRegistrationView, reviewRegistration, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
};
