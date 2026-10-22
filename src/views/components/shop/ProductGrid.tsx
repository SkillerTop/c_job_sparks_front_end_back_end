import type { ShopInventoryItem, ShopProduct, SpendableSparkBalances } from '@/models/shop';

import type { ProductAction } from '@/utils/shop';
import { ProductCard } from './ProductCard';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function ProductGrid({
  products,
  balances,
  inventory,
  purchasingId,
  readOnly = false,
  onAction,
}: {
  products: ShopProduct[];
  balances: SpendableSparkBalances;
  inventory: ShopInventoryItem[];
  purchasingId: string | null;
  readOnly?: boolean;
  onAction: (product: ShopProduct, action: ProductAction) => void;
}) {
  const shopText = useLocalizedShopText();
  return (
    <section className={styles.productGrid} aria-label={shopText.aria.catalog}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          balances={balances}
          inventory={inventory}
          loading={purchasingId === product.id}
          readOnly={readOnly}
          onAction={onAction}
        />
      ))}
    </section>
  );
}
