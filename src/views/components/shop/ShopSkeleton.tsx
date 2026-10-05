import { SHOP_TEXT } from '@/constants/shop';
import styles from '@/views/styles/shop.module.css';

export function ShopSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.productGrid} role="status" aria-live="polite" aria-label={SHOP_TEXT.status.loadingCatalog}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.skeletonCard} key={index} aria-hidden="true">
          <span className={styles.skeletonMedia} />
          <span className={styles.skeletonLineStrong} />
          <span className={styles.skeletonLine} />
          <span className={styles.skeletonLineShort} />
          <span className={styles.skeletonButton} />
        </div>
      ))}
      <span className={styles.visuallyHidden}>{SHOP_TEXT.status.loadingProducts}</span>
    </div>
  );
}
