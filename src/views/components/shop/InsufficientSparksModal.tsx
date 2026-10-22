import { Link } from 'react-router-dom';
import { Modal } from '@/views/components/common/Modal';

import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { ProductVisual } from './ProductVisual';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function InsufficientSparksModal({
  product,
  balances,
  onClose,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  onClose: () => void;
}) {
  const shopText = useLocalizedShopText();
  const available = product ? balances[product.priceSparkType] : 0;
  const missing = product ? Math.max(0, product.price - available) : 0;
  return (
    <Modal
      open={Boolean(product)}
      title={shopText.purchase.insufficientTitle}
      description={shopText.purchase.insufficientDescription(missing, product?.priceSparkType ?? 'White')}
      onClose={onClose}
    >
      {product && (
        <div className={styles.insufficientBody}>
          <ProductVisual product={product} size="inventory" />
          <div className={styles.insufficientNumbers}>
            <span>{shopText.purchase.balance} <SparkAmount amount={available} sparkType={product.priceSparkType} /></span>
            <span>{shopText.labels.price} <SparkAmount amount={product.price} sparkType={product.priceSparkType} /></span>
            <span className={styles.missingSparks}>
              {shopText.purchase.missing} <SparkAmount amount={missing} sparkType={product.priceSparkType} />
            </span>
          </div>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" onClick={onClose}>{shopText.purchase.close}</button>
            <Link className={styles.shopPrimaryLink} to="/sparks" onClick={onClose}>
              {shopText.purchase.earnSparks}
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
