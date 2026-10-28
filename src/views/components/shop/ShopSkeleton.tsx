
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function ShopSkeleton({ count = 8 }: { count?: number }) {
  const shopText = useLocalizedShopText();
  return (
    <div className={styles.productGrid} role="status" aria-live="polite" aria-label={shopText.status.loadingCatalog}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.skeletonCard} key={index} aria-hidden="true">
          <span className={styles.skeletonMedia} />
          <span className={styles.skeletonLineStrong} />
          <span className={styles.skeletonLine} />
          <span className={styles.skeletonLineShort} />
          <span className={styles.skeletonButton} />
        </div>
      ))}
      <span className={styles.visuallyHidden}>{shopText.status.loadingProducts}</span>
    </div>
  );
}
