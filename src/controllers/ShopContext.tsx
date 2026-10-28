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
import { useLocation } from 'react-router-dom';
import {
  EMPTY_SHOP_EFFECTS,
  type PurchaseFulfillmentChoice,
  type PurchaseResult,
  type ShopEffects,
  type ShopSnapshot,
  type SpendableSparkBalances,
} from '@/models/shop';
import { SHOP_TEXT } from '@/constants/shop';
import { SHOP_ROLES } from '@/constants/app';
import { ShopServiceError, shopService } from '@/services/shopService';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';

interface ShopContextValue {
  snapshot: ShopSnapshot | null;
  balances: SpendableSparkBalances | null;
  loading: boolean;
  error: string | null;
  purchasingId: string | null;
  activatingId: string | null;
  effects: ShopEffects;
  refresh: () => Promise<void>;
  purchase: (productId: string, fulfillment?: PurchaseFulfillmentChoice) => Promise<PurchaseResult>;
  activate: (inventoryId: string) => Promise<void>;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { snapshot: sparkSnapshot, syncShopTransactions } = useSpark();
  const [snapshot, setSnapshot] = useState<ShopSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const generation = useRef(0);
  const mutationLock = useRef(false);
  const hasSnapshot = useRef(false);
  const lastRefreshAt = useRef(0);
  const accountId = user?.accountId;
  const shouldLoadShop =
    location.pathname === '/shop' ||
    location.pathname === '/inventory' ||
    (location.pathname === '/admin' && new URLSearchParams(location.search).get('tab') === 'shop');
  const clientIdentity = useMemo(
    () => user ? { id: user.employeeId, email: user.email, role: user.role } : undefined,
    [user],
  );
  const effects = useMemo<ShopEffects>(() => {
    if (!snapshot) return sparkSnapshot?.shopEffects ?? EMPTY_SHOP_EFFECTS;
    const now = Date.now();
    const activeItems = snapshot.inventory.filter(
      (item) => item.status === 'Active' && (!item.expiresAt || Date.parse(item.expiresAt) > now),
    );
    const activeIds = new Set(activeItems.map((item) => item.product.id));
    const activeCodes = new Set(activeItems.map((item) => item.product.effectCode).filter(Boolean));
    return {
      doubleWhiteSparks: activeCodes.has('double_white') || activeIds.has('double-stars-24h'),
      focusMode: activeCodes.has('focus_mode') || activeIds.has('focus-beacon'),
      goldenProfileFrame: activeCodes.has('profile_frame') || activeIds.has('gold-profile-frame'),
      neonTheme: activeCodes.has('theme_unlock') || activeIds.has('neon-theme'),
      signatureBadge: activeCodes.has('badge_unlock') || activeIds.has('personal-badge'),
      vipStatus: activeIds.has('vip-seven-days'),
    };
  }, [snapshot, sparkSnapshot?.shopEffects]);

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
    if (!shouldLoadShop || !accountId || !user || !SHOP_ROLES.includes(user.role)) {
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
      lastRefreshAt.current = Date.now();
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      if (requestId !== generation.current) return;
      setError(caught instanceof Error ? caught.message : SHOP_TEXT.errors.loadShop);
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  }, [accountId, clientIdentity, shouldLoadShop, syncShopTransactions, user]);

  useEffect(() => {
    generation.current += 1;
    if (!shouldLoadShop || !accountId || !user || !SHOP_ROLES.includes(user.role)) {
      setError(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [accountId, refresh, shouldLoadShop, user]);

  useEffect(() => {
    if (!accountId || !shouldLoadShop) return;
    const sync = () => {
      if (
        document.visibilityState === 'visible' &&
        !mutationLock.current &&
        Date.now() - lastRefreshAt.current >= 5 * 60_000
      ) void refresh();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [accountId, refresh, shouldLoadShop]);

  const purchase = useCallback(async (productId: string, fulfillment?: PurchaseFulfillmentChoice) => {
    if (mutationLock.current) throw new ShopServiceError(SHOP_TEXT.errors.purchaseInProgress, 'PURCHASE_IN_PROGRESS');
    if (!clientIdentity) throw new ShopServiceError(SHOP_TEXT.status.identityRequired, 'IDENTITY_REQUIRED', 401);
    mutationLock.current = true;
    setPurchasingId(productId);
    try {
      const result = await shopService.purchase(productId, clientIdentity, undefined, fulfillment);
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
      // The shop endpoint reads the authoritative PostgreSQL spark_accounts rows.
      // A section workspace may intentionally contain only a transaction subset.
      balances: snapshot?.balances ?? null,
      loading,
      error,
      purchasingId,
      activatingId,
      effects,
      refresh,
      purchase,
      activate,
    }),
    [snapshot, loading, error, purchasingId, activatingId, effects, refresh, purchase, activate],
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
