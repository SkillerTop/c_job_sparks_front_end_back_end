import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AppSnapshot,
  AwardInput,
  DisenchantReportResult,
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
import { useAuth } from '@/controllers/AuthContext';
import { useLocation } from 'react-router-dom';

interface SparkContextValue {
  snapshot: AppSnapshot | null;
  loading: boolean;
  sectionLoading: boolean;
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
  exportDisenchantRequests: (requestIds: string[], exportReference: string) => Promise<{ fileName: string; csv: string }>;
  markDisenchantPaid: (requestId: string) => Promise<void>;
  createMonthlyDisenchantReport: (reportMonth: string) => Promise<DisenchantReportResult>;
  toggleQualityGate: (employeeId: string, input?: QualityGateInput) => Promise<void>;
  previewImport: (kind: 'KPI' | 'Evaluation', quarter: string, file: File) => Promise<ImportPreview>;
  confirmImport: (preview: ImportPreview, replace: boolean) => Promise<void>;
  updateSettings: (input: Partial<AppSnapshot['settings']>) => Promise<void>;
  saveReference: (draft: ReferenceDraft) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  deleteEmployee: (employeeId: string) => Promise<void>;
  syncShopTransactions: (transactions: ShopSparkTransaction[]) => Promise<void>;
  resetDemo: () => Promise<boolean>;
}

const SparkContext = createContext<SparkContextValue | null>(null);

const workspaceSections = new Set([
  'dashboard',
  'profile',
  'sparks',
  'recognition',
  'achievements',
  'company-achievements',
  'shop',
  'inventory',
  'convert',
  'disenchant',
  'award',
  'approvals',
  'team',
  'admin',
  'rules',
]);

function sectionForPath(pathname: string) {
  const route = pathname === '/' ? 'dashboard' : pathname.slice(1).split('/')[0] || 'dashboard';
  if (route === 'performance') return 'achievements';
  return workspaceSections.has(route) ? route : 'dashboard';
}

export function SparkProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout, refreshAuth } = useAuth();
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceGeneration = useRef(0);
  const lastSectionRefreshAt = useRef(0);
  const { mutating, execute, isLocked } = useMutationLock();
  const directoryUser = snapshot?.employees.find((employee) => employee.id === user?.employeeId && employee.active);
  const identityError = snapshot && user && !directoryUser
    ? 'Your employee profile is inactive or no longer exists. Sign in with another account.'
    : null;
  const activeRole: Role = directoryUser?.role ?? 'Employee';
  const currentUserId = user?.employeeId ?? '';
  const section = sectionForPath(location.pathname);

  useEffect(() => {
    if (identityError) logout();
  }, [identityError, logout]);

  const refresh = useCallback(async () => {
    const generation = ++workspaceGeneration.current;
    if (!user) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await sparkService.getSnapshot(section);
      if (generation === workspaceGeneration.current) {
        setSnapshot((current) => ({ ...next, shell: next.shell ?? current?.shell }));
        lastSectionRefreshAt.current = Date.now();
      }
    } catch (caught) {
      if (generation === workspaceGeneration.current)
        setError(caught instanceof Error ? caught.message : 'Could not load the workspace.');
    } finally {
      if (generation === workspaceGeneration.current) setLoading(false);
    }
  }, [section, user]);

  useEffect(() => {
    const generation = ++workspaceGeneration.current;
    setSnapshot(null);
    setLayoutReady(false);
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void sparkService.getLayoutSnapshot()
      .then((next) => {
        if (generation !== workspaceGeneration.current) return;
        setSnapshot(next);
        setLayoutReady(true);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (generation === workspaceGeneration.current)
          setError(caught instanceof Error ? caught.message : 'Could not load the workspace.');
      })
      .finally(() => {
        if (generation === workspaceGeneration.current) setLoading(false);
      });
    return () => {
      workspaceGeneration.current += 1;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !layoutReady) return;
    const generation = ++workspaceGeneration.current;
    setSectionLoading(true);
    void sparkService.getSnapshot(section)
      .then((next) => {
        if (generation !== workspaceGeneration.current) return;
        setSnapshot((current) => ({ ...next, shell: next.shell ?? current?.shell }));
        lastSectionRefreshAt.current = Date.now();
        setError(null);
      })
      .catch((caught: unknown) => {
        if (generation === workspaceGeneration.current)
          setError(caught instanceof Error ? caught.message : 'Could not load this workspace section.');
      })
      .finally(() => {
        if (generation === workspaceGeneration.current) setSectionLoading(false);
      });
  }, [layoutReady, section, user]);

  useEffect(() => {
    const syncCalendarState = async () => {
      if (!user || document.visibilityState !== 'visible' || isLocked()) return;
      if (Date.now() - lastSectionRefreshAt.current < 5 * 60_000) return;
      const generation = ++workspaceGeneration.current;
      try {
        const next = await sparkService.getSnapshot(section);
        if (generation === workspaceGeneration.current) {
          setSnapshot((current) => ({ ...next, shell: next.shell ?? current?.shell }));
          lastSectionRefreshAt.current = Date.now();
          setError(null);
        }
      } catch (caught) {
        if (generation === workspaceGeneration.current)
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
  }, [isLocked, section, user]);

  const updateSnapshot = (next: AppSnapshot) =>
    setSnapshot((current) => ({ ...next, shell: next.shell ?? current?.shell }));
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
  const exportDisenchantRequests = (requestIds: string[], exportReference: string) =>
    executeAuthorized(async () => {
      const result = await sparkService.exportDisenchantRequests(currentUserId, requestIds, exportReference);
      updateSnapshot(result.snapshot);
      return { fileName: result.fileName, csv: result.csv };
    });
  const markDisenchantPaid = (requestId: string) =>
    executeAuthorized(async () =>
      updateSnapshot(await sparkService.markDisenchantPaid(currentUserId, requestId)),
    );
  const createMonthlyDisenchantReport = (reportMonth: string) =>
    executeAuthorized(async () => {
      const result = await sparkService.createMonthlyDisenchantReport(currentUserId, reportMonth);
      updateSnapshot(result.snapshot);
      return result.report;
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
  const deleteCategory = (categoryId: string) =>
    executeAuthorized(async () =>
      updateSnapshot(await sparkService.deleteCategory(currentUserId, categoryId)),
    );
  const deleteEmployee = (employeeId: string) =>
    executeAuthorized(async () => {
      const next = await sparkService.deleteEmployee(currentUserId, employeeId);
      await authService.deleteEmployeeAccount(employeeId);
      updateSnapshot(next);
      await refreshAuth();
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

  const value: SparkContextValue = {
      snapshot,
      loading,
      sectionLoading,
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
      exportDisenchantRequests,
      markDisenchantPaid,
      createMonthlyDisenchantReport,
      toggleQualityGate,
      previewImport,
      confirmImport,
      updateSettings,
      saveReference,
      deleteCategory,
      deleteEmployee,
      syncShopTransactions,
      resetDemo,
  };

  return <SparkContext.Provider value={value}>{children}</SparkContext.Provider>;
}

export const useSpark = () => {
  const value = useContext(SparkContext);
  if (!value) throw new Error('useSpark must be used inside SparkProvider.');
  return value;
};
