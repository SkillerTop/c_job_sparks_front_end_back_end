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
import type { PurchaseResult, ShopEffects, ShopSnapshot, SpendableSparkBalances } from '@/models/shop';
import { SHOP_TEXT } from '@/constants/shop';
import { ShopServiceError, shopService } from '@/services/shopService';
import { calculateBalances } from '@/utils/sparkRules';
import { useAuth } from './AuthContext';
import { useSpark } from './SparkContext';

interface ShopContextValue {
  snapshot: ShopSnapshot | null;
  balances: SpendableSparkBalances | null;
  loading: boolean;
  error: string | null;
  purchasingId: string | null;
  activatingId: string | null;
  effects: ShopEffects;
  refresh: () => Promise<void>;
  purchase: (productId: string) => Promise<PurchaseResult>;
  activate: (inventoryId: string) => Promise<void>;
}

const ShopContext = createContext<ShopContextValue | null>(null);

const EMPTY_EFFECTS: ShopEffects = {
  doubleWhiteSparks: false,
  focusMode: false,
  goldenProfileFrame: false,
  neonTheme: false,
  signatureBadge: false,
  vipStatus: false,
};

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { snapshot: sparkSnapshot, currentUserId, syncShopTransactions } = useSpark();
  const [snapshot, setSnapshot] = useState<ShopSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const generation = useRef(0);
  const mutationLock = useRef(false);
  const hasSnapshot = useRef(false);
  const accountId = user?.accountId;
  const ledgerBalances = useMemo<SpendableSparkBalances | null>(
    () => {
      if (!sparkSnapshot || !currentUserId) return null;
      const current = calculateBalances(sparkSnapshot.transactions, currentUserId);
      return { White: current.White, Yellow: current.Yellow, Blue: current.Blue };
    },
    [sparkSnapshot, currentUserId],
  );
  const clientIdentity = useMemo(
    () => user ? { id: user.employeeId, email: user.email, role: user.role } : undefined,
    [user?.employeeId, user?.email, user?.role],
  );
  const effects = useMemo<ShopEffects>(() => {
    if (!snapshot) return EMPTY_EFFECTS;
    const now = Date.now();
    const activeIds = new Set(
      snapshot.inventory
        .filter((item) => item.status === 'Active' && (!item.expiresAt || Date.parse(item.expiresAt) > now))
        .map((item) => item.product.id),
    );
    return {
      doubleWhiteSparks: activeIds.has('double-stars-24h'),
      focusMode: activeIds.has('focus-beacon'),
      goldenProfileFrame: activeIds.has('gold-profile-frame'),
      neonTheme: activeIds.has('neon-theme'),
      signatureBadge: activeIds.has('personal-badge'),
      vipStatus: activeIds.has('vip-seven-days'),
    };
  }, [snapshot]);

  useEffect(() => {
    const root = document.documentElement;
    const attributes: Array<[string, boolean]> = [
      ['data-shop-neon-theme', effects.neonTheme],
      ['data-shop-golden-frame', effects.goldenProfileFrame],
      ['data-shop-focus-mode', effects.focusMode],
      ['data-shop-vip', effects.vipStatus],
    ];
    attributes.forEach(([name, enabled]) => {
      if (enabled) root.setAttribute(name, 'true');
      else root.removeAttribute(name);
    });
    return () => attributes.forEach(([name]) => root.removeAttribute(name));
  }, [effects]);

  const refresh = useCallback(async () => {
    if (!accountId) {
      hasSnapshot.current = false;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = ++generation.current;
    setLoading(!hasSnapshot.current);
    try {
      const next = await shopService.getSnapshot(clientIdentity);
      if (requestId !== generation.current) return;
      await syncShopTransactions(next.transactions);
      if (requestId !== generation.current) return;
      hasSnapshot.current = true;
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      if (requestId !== generation.current) return;
      setError(caught instanceof Error ? caught.message : SHOP_TEXT.errors.loadShop);
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  }, [accountId, clientIdentity, syncShopTransactions]);

  useEffect(() => {
    generation.current += 1;
    if (!accountId) {
      hasSnapshot.current = false;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [accountId, refresh]);

  useEffect(() => {
    if (!accountId) return;
    const sync = () => {
      if (document.visibilityState === 'visible' && !mutationLock.current) void refresh();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [accountId, refresh]);

  const purchase = useCallback(async (productId: string) => {
    if (mutationLock.current) throw new ShopServiceError(SHOP_TEXT.errors.purchaseInProgress, 'PURCHASE_IN_PROGRESS');
    if (!clientIdentity) throw new ShopServiceError(SHOP_TEXT.status.identityRequired, 'IDENTITY_REQUIRED', 401);
    mutationLock.current = true;
    setPurchasingId(productId);
    try {
      const result = await shopService.purchase(productId, clientIdentity);
      await syncShopTransactions(result.transactions);
      const { purchase: _purchase, inventoryItem: _item, ...nextSnapshot } = result;
      setSnapshot(nextSnapshot);
      setError(null);
      return result;
    } finally {
      mutationLock.current = false;
      setPurchasingId(null);
    }
  }, [clientIdentity, syncShopTransactions]);

  const activate = useCallback(async (inventoryId: string) => {
    if (mutationLock.current) return;
    if (!clientIdentity) throw new ShopServiceError(SHOP_TEXT.status.identityRequired, 'IDENTITY_REQUIRED', 401);
    mutationLock.current = true;
    setActivatingId(inventoryId);
    try {
      const next = await shopService.activate(inventoryId, clientIdentity);
      await syncShopTransactions(next.transactions);
      setSnapshot(next);
      setError(null);
    } finally {
      mutationLock.current = false;
      setActivatingId(null);
    }
  }, [clientIdentity, syncShopTransactions]);

  const value = useMemo<ShopContextValue>(
    () => ({
      snapshot,
      balances: ledgerBalances ?? snapshot?.balances ?? null,
      loading,
      error,
      purchasingId,
      activatingId,
      effects,
      refresh,
      purchase,
      activate,
    }),
    [snapshot, ledgerBalances, loading, error, purchasingId, activatingId, effects, refresh, purchase, activate],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => {
  const value = useContext(ShopContext);
  if (!value) throw new Error('useShop must be used inside ShopProvider.');
  return value;
};

export const isInsufficientSparksError = (error: unknown) =>
  error instanceof ShopServiceError && error.code === 'INSUFFICIENT_SPARKS';
