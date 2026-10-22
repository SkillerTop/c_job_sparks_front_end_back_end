import { SearchX } from 'lucide-react';

import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function EmptyShopState({ onReset }: { onReset: () => void }) {
  const shopText = useLocalizedShopText();
  return (
    <section className={styles.emptyShop}>
      <span><SearchX size={24} aria-hidden="true" /></span>
      <h2>{shopText.shop.emptyTitle}</h2>
      <p>{shopText.shop.emptyDescription}</p>
      <button type="button" className={styles.shopSecondaryButton} onClick={onReset}>
        {shopText.shop.resetFilters}
      </button>
    </section>
  );
}
