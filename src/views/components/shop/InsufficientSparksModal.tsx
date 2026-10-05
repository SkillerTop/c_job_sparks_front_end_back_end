import { Link } from 'react-router-dom';
import { Modal } from '@/views/components/common/Modal';
import { SHOP_TEXT } from '@/constants/shop';
import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { ProductVisual } from './ProductVisual';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

export function InsufficientSparksModal({
  product,
  balances,
  onClose,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  onClose: () => void;
}) {
  const available = product ? balances[product.priceSparkType] : 0;
  const missing = product ? Math.max(0, product.price - available) : 0;
  return (
    <Modal
      open={Boolean(product)}
      title={SHOP_TEXT.purchase.insufficientTitle}
      description={SHOP_TEXT.purchase.insufficientDescription(missing, product?.priceSparkType ?? 'White')}
      onClose={onClose}
    >
      {product && (
        <div className={styles.insufficientBody}>
          <ProductVisual product={product} size="inventory" />
          <div className={styles.insufficientNumbers}>
            <span>{SHOP_TEXT.purchase.balance} <SparkAmount amount={available} sparkType={product.priceSparkType} /></span>
            <span>{SHOP_TEXT.labels.price} <SparkAmount amount={product.price} sparkType={product.priceSparkType} /></span>
            <span className={styles.missingSparks}>
              {SHOP_TEXT.purchase.missing} <SparkAmount amount={missing} sparkType={product.priceSparkType} />
            </span>
          </div>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" onClick={onClose}>{SHOP_TEXT.purchase.close}</button>
            <Link className={styles.shopPrimaryLink} to="/sparks" onClick={onClose}>
              {SHOP_TEXT.purchase.earnSparks}
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
