import { RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategoryFilter } from '@/views/components/shop/CategoryFilter';
import { EmptyShopState } from '@/views/components/shop/EmptyShopState';
import { InsufficientSparksModal } from '@/views/components/shop/InsufficientSparksModal';
import { ProductGrid } from '@/views/components/shop/ProductGrid';
import { PurchaseModal } from '@/views/components/shop/PurchaseModal';
import { PurchaseSuccessModal } from '@/views/components/shop/PurchaseSuccessModal';
import { ShopHeader } from '@/views/components/shop/ShopHeader';
import { ShopSkeleton } from '@/views/components/shop/ShopSkeleton';
import { Feedback } from '@/views/components/common/Feedback';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SHOP_CATEGORIES, SHOP_SORTS, SHOP_TEXT } from '@/constants/shop';
import { isInsufficientSparksError, useShop } from '@/controllers/ShopContext';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { ShopCategoryFilter, ShopProduct, ShopSort } from '@/models/shop';
import { emptySpendableBalances, filterAndSortProducts, type ProductAction } from '@/utils/shop';
import styles from '@/views/styles/shop.module.css';

export function ShopPage() {
  const { activeRole } = useSpark();
  const { t } = useUserPreferences();
  const { snapshot, balances, loading, error, purchasingId, refresh, purchase } = useShop();
  const readOnly = activeRole === 'Top Management';
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const sortParam = searchParams.get('sort');
  const category: ShopCategoryFilter = SHOP_CATEGORIES.some((item) => item.value === categoryParam)
    ? categoryParam as ShopCategoryFilter
    : 'All';
  const sort: ShopSort = SHOP_SORTS.some((item) => item.value === sortParam)
    ? sortParam as ShopSort
    : 'popular';
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [insufficient, setInsufficient] = useState<ShopProduct | null>(null);
  const [successful, setSuccessful] = useState<ShopProduct | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const products = useMemo(
    () => filterAndSortProducts(snapshot?.products ?? [], category, sort),
    [snapshot?.products, category, sort],
  );
  const currentBalances = balances ?? emptySpendableBalances();
  const updateFilter = (key: 'category' | 'sort', value: string, defaultValue: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  const chooseProduct = (product: ShopProduct, action: ProductAction) => {
    if (readOnly) return;
    setPurchaseError(null);
    if (action === 'insufficient') {
      setInsufficient(product);
      return;
    }
    if (action === 'buy') setSelected(product);
  };

  const confirmPurchase = async () => {
    if (!selected || purchasingId) return;
    setPurchaseError(null);
    try {
      const bought = selected;
      await purchase(bought.id);
      setSelected(null);
      setSuccessful(bought);
    } catch (caught) {
      if (isInsufficientSparksError(caught)) {
        const product = selected;
        setSelected(null);
        setInsufficient(product);
        void refresh();
        return;
      }
      setPurchaseError(caught instanceof Error ? caught.message : SHOP_TEXT.errors.finishPurchase);
    }
  };

  return (
    <PageTransition>
      <div className={styles.shopPage}>
        <ShopHeader balances={balances} loading={loading} />
        {readOnly && <Feedback tone="info">{t('shop.readOnly')}</Feedback>}
        {error && (
          <div className={styles.shopFeedback}>
            <Feedback tone="error">{error}</Feedback>
            <button type="button" className={styles.shopSecondaryButton} onClick={() => void refresh()}>
              <RefreshCcw size={15} /> {SHOP_TEXT.shop.retry}
            </button>
          </div>
        )}
        {snapshot && (
          <CategoryFilter
            category={category}
            sort={sort}
            onCategoryChange={(value) => updateFilter('category', value, 'All')}
            onSortChange={(value) => updateFilter('sort', value, 'popular')}
          />
        )}
        {loading && !snapshot ? (
          <ShopSkeleton />
        ) : snapshot && products.length > 0 ? (
          <ProductGrid
            products={products}
            balances={currentBalances}
            inventory={snapshot?.inventory ?? []}
            purchasingId={purchasingId}
            readOnly={readOnly}
            onAction={chooseProduct}
          />
        ) : snapshot ? (
          <EmptyShopState onReset={() => {
            setSearchParams({}, { replace: true });
          }} />
        ) : null}
      </div>

      <PurchaseModal
        product={selected}
        balances={currentBalances}
        loading={Boolean(selected && purchasingId === selected.id)}
        error={purchaseError}
        onClose={() => {
          setSelected(null);
          setPurchaseError(null);
        }}
        onConfirm={() => void confirmPurchase()}
      />
      <InsufficientSparksModal
        product={insufficient}
        balances={currentBalances}
        onClose={() => setInsufficient(null)}
      />
      <PurchaseSuccessModal
        product={successful}
        balances={currentBalances}
        onClose={() => setSuccessful(null)}
      />
    </PageTransition>
  );
}
