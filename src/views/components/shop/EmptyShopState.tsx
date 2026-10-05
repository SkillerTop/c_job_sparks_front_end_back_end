import { SearchX } from 'lucide-react';
import { SHOP_TEXT } from '@/constants/shop';
import styles from '@/views/styles/shop.module.css';

export function EmptyShopState({ onReset }: { onReset: () => void }) {
  return (
    <section className={styles.emptyShop}>
      <span><SearchX size={24} aria-hidden="true" /></span>
      <h2>{SHOP_TEXT.shop.emptyTitle}</h2>
      <p>{SHOP_TEXT.shop.emptyDescription}</p>
      <button type="button" className={styles.shopSecondaryButton} onClick={onReset}>
        {SHOP_TEXT.shop.resetFilters}
      </button>
    </section>
  );
}
