import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AppSnapshot,
  AwardInput,
  ImportPreview,
  QualityGateInput,
  RecognitionInput,
  ReferenceDraft,
  Role,
  SparkType,
} from '@/models';
import type { ShopSparkTransaction } from '@/models/shop';
import { sparkService } from '@/services/sparkService';
import { authService } from '@/services/authService';
import { useMutationLock } from '@/hooks/useMutationLock';
import { useAuth } from './AuthContext';

interface SparkContextValue {
  snapshot: AppSnapshot | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  activeRole: Role;
  currentUserId: string;
  refresh: () => Promise<void>;
  createRecognition: (input: RecognitionInput) => Promise<void>;
  reviewRecognition: (id: string, decision: 'Approved' | 'Rejected', reason?: string) => Promise<void>;
  reviewAward: (id: string, decision: 'Approved' | 'Rejected', reason?: string) => Promise<void>;
  createAward: (input: AwardInput) => Promise<'Pending' | 'Approved'>;
  convert: (from: SparkType, amount: number) => Promise<{
    output: number;
    to: SparkType;
    fee: number;
    totalDebited: number;
  }>;
  disenchant: (
    type: Exclude<SparkType, 'Radiant'>,
    amount: number,
  ) => Promise<{ moneyValue: number; currency: string }>;
  toggleQualityGate: (employeeId: string, input?: QualityGateInput) => Promise<void>;
  previewImport: (kind: 'KPI' | 'Evaluation', quarter: string, file: File) => Promise<ImportPreview>;
  confirmImport: (preview: ImportPreview, replace: boolean) => Promise<void>;
  updateSettings: (input: Partial<AppSnapshot['settings']>) => Promise<void>;
  saveReference: (draft: ReferenceDraft) => Promise<void>;
  syncShopTransactions: (transactions: ShopSparkTransaction[]) => Promise<void>;
  resetDemo: () => Promise<boolean>;
}

const SparkContext = createContext<SparkContextValue | null>(null);

export function SparkProvider({ children }: { children: ReactNode }) {
  const { user, logout, refreshAuth } = useAuth();
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mutating, execute, isLocked } = useMutationLock();
  const directoryUser = snapshot?.employees.find((employee) => employee.id === user?.employeeId && employee.active);
  const identityError = snapshot && user && !directoryUser
    ? 'Your employee profile is inactive or no longer exists. Sign in with another account.'
    : null;
  const activeRole: Role = directoryUser?.role ?? 'Employee';
  const currentUserId = user?.employeeId ?? '';

  useEffect(() => {
    if (identityError) logout();
  }, [identityError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await sparkService.getSnapshot());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const syncCalendarState = async () => {
      if (document.visibilityState !== 'visible' || isLocked()) return;
      try {
        setSnapshot(await sparkService.getSnapshot());
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not refresh the workspace.');
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncCalendarState();
    };
    window.addEventListener('focus', syncCalendarState);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(() => void syncCalendarState(), 60_000);
    return () => {
      window.removeEventListener('focus', syncCalendarState);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [isLocked]);

  const updateSnapshot = (next: AppSnapshot) => setSnapshot(next);
  const executeAuthorized = <T,>(action: () => Promise<T>) =>
    execute(async () => {
      await authService.assertActiveSession(currentUserId);
      return action();
    });
  const createRecognition = (input: RecognitionInput) =>
    executeAuthorized(async () =>
      updateSnapshot((await sparkService.createRecognition(currentUserId, activeRole, input)).snapshot),
    );
  const reviewRecognition = (id: string, decision: 'Approved' | 'Rejected', reason = '') =>
    executeAuthorized(async () =>
      updateSnapshot(await sparkService.reviewRecognition(id, decision, reason, currentUserId)),
    );
  const reviewAward = (id: string, decision: 'Approved' | 'Rejected', reason = '') =>
    executeAuthorized(async () => updateSnapshot(await sparkService.reviewAward(id, decision, reason, currentUserId)));
  const createAward = (input: AwardInput) =>
    executeAuthorized(async () => {
      const result = await sparkService.createAward(currentUserId, activeRole, input);
      updateSnapshot(result.snapshot);
      return result.request.status;
    });
  const convert = (from: SparkType, amount: number) =>
    executeAuthorized(async () => {
      const result = await sparkService.convert(currentUserId, from, amount);
      updateSnapshot(result.snapshot);
      return {
        output: result.output,
        to: result.to,
        fee: result.fee,
        totalDebited: result.totalDebited,
      };
    });
  const disenchant = (type: Exclude<SparkType, 'Radiant'>, amount: number) =>
    executeAuthorized(async () => {
      const result = await sparkService.disenchant(currentUserId, type, amount);
      updateSnapshot(result.snapshot);
      return { moneyValue: result.request.moneyValue, currency: result.request.currency };
    });
  const toggleQualityGate = (employeeId: string, input?: QualityGateInput) =>
    executeAuthorized(async () =>
      updateSnapshot(await sparkService.toggleQualityGate(employeeId, currentUserId, input)),
    );
  const previewImport = async (kind: 'KPI' | 'Evaluation', quarter: string, file: File) => {
    await authService.assertActiveSession(currentUserId);
    return sparkService.previewImport(kind, quarter, file, currentUserId);
  };
  const confirmImport = (preview: ImportPreview, replace: boolean) =>
    executeAuthorized(async () => updateSnapshot(await sparkService.confirmImport(preview, currentUserId, replace)));
  const updateSettings = (input: Partial<AppSnapshot['settings']>) =>
    executeAuthorized(async () => updateSnapshot(await sparkService.updateSettings(currentUserId, input)));
  const saveReference = (draft: ReferenceDraft) =>
    executeAuthorized(async () => {
      const save = () => sparkService.saveReference(currentUserId, draft);
      const next =
        draft.kind === 'employees' && draft.data.id
          ? await authService.withEmployeeIdentityGuard(draft.data.id, draft.data.email, save)
          : await save();
      updateSnapshot(next);
      if (draft.kind === 'employees') await refreshAuth();
    });
  const syncShopTransactions = useCallback(async (transactions: ShopSparkTransaction[]) => {
    if (!currentUserId) return;
    await authService.assertActiveSession(currentUserId);
    updateSnapshot(await sparkService.syncShopTransactions(currentUserId, transactions));
  }, [currentUserId]);
  const resetDemo = async () => {
    if (isLocked()) return false;
    return execute(async () => {
      await authService.assertAdministratorSession(currentUserId);
      const next = sparkService.reset();
      await refreshAuth();
      setSnapshot(next);
      return true;
    });
  };

  const value = useMemo<SparkContextValue>(
    () => ({
      snapshot,
      loading,
      mutating,
      error: error ?? identityError,
      activeRole,
      currentUserId,
      refresh,
      createRecognition,
      reviewRecognition,
      reviewAward,
      createAward,
      convert,
      disenchant,
      toggleQualityGate,
      previewImport,
      confirmImport,
      updateSettings,
      saveReference,
      syncShopTransactions,
      resetDemo,
    }),
    [snapshot, loading, mutating, error, identityError, activeRole, currentUserId, refresh, syncShopTransactions],
  );

  return <SparkContext.Provider value={value}>{children}</SparkContext.Provider>;
}

export const useSpark = () => {
  const value = useContext(SparkContext);
  if (!value) throw new Error('useSpark must be used inside SparkProvider.');
  return value;
};
