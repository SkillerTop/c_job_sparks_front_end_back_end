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
  AuthAccount,
  AuthAccountStatus,
  AuthUser,
  LoginInput,
  RegistrationInput,
} from '@/models/auth';
import { AUTH_CHANGE_EVENT, AUTH_STATE_STORAGE_KEY, authService } from '@/services/authService';

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
  ) => Promise<AuthAccount>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [registrationAccount, setRegistrationAccount] = useState<AuthAccount | null>(null);
  const [accessState, setAccessState] = useState<AuthAccessState>({ accounts: [], auditEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);

  const refreshAuth = useCallback(async () => {
    const requestId = ++refreshGeneration.current;
    try {
      await authService.initialize();
      const nextUser = await authService.restoreSession();
      const [nextAccess, nextRegistration] = await Promise.all([
        nextUser?.role === 'Administrator'
          ? authService.getAccessState()
          : Promise.resolve({ accounts: [], auditEvents: [] }),
        authService.getLastRegistration(),
      ]);
      if (requestId !== refreshGeneration.current) return;
      setUser(nextUser);
      setAccessState(nextAccess);
      setRegistrationAccount(nextRegistration);
      setError(null);
    } catch (caught) {
      if (requestId !== refreshGeneration.current) return;
      setUser(null);
      setAccessState({ accounts: [], auditEvents: [] });
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

  useEffect(() => {
    if (!user) return;
    const revalidate = () => void refreshAuth();
    const expiry = authService.getSessionExpiry();
    const timeout = window.setTimeout(revalidate, Math.max(0, (expiry ?? Date.now()) - Date.now() + 50));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, refreshAuth]);

  const login = async (input: LoginInput) => {
    const account = await authService.login(input);
    await refreshAuth();
    return account.status;
  };

  const register = async (input: RegistrationInput) => {
    const account = await authService.register(input);
    await refreshAuth();
    return account;
  };

  const logout = () => {
    refreshGeneration.current += 1;
    authService.logout();
    setUser(null);
    setAccessState({ accounts: [], auditEvents: [] });
    setError(null);
  };

  const clearRegistrationView = () => {
    refreshGeneration.current += 1;
    authService.clearRegistrationView();
    setRegistrationAccount(null);
  };

  const reviewRegistration: AuthContextValue['reviewRegistration'] = async (accountId, decision, reason) => {
    const account = await authService.reviewRegistration(accountId, decision, reason);
    await refreshAuth();
    return account;
  };

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
    [accessState, user, registrationAccount, loading, error, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
};
