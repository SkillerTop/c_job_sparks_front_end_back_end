import type { ShopInventoryItem, ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { SHOP_TEXT } from '@/constants/shop';
import type { ProductAction } from '@/utils/shop';
import { ProductCard } from './ProductCard';
import styles from '@/views/styles/shop.module.css';

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
  return (
    <section className={styles.productGrid} aria-label={SHOP_TEXT.aria.catalog}>
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
