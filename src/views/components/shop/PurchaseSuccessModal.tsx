import { Check, PackageCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/views/components/common/Modal';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { SHOP_TEXT } from '@/constants/shop';
import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

export function PurchaseSuccessModal({
  product,
  balances,
  onClose,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(product)}
      title={SHOP_TEXT.purchase.successTitle}
      description={SHOP_TEXT.purchase.successDescription}
      onClose={onClose}
    >
      {product && (
        <div className={styles.successPurchase} role="status" aria-live="polite">
          <div className={styles.successBurst} aria-hidden="true">
            <span><SparkIcon type="White" size={20} animated={false} /></span>
            <span><Sparkles /></span>
            <span><SparkIcon type={product.priceSparkType} size={20} animated={false} /></span>
            <strong><Check /></strong>
          </div>
          <h3>{product.name}</h3>
          <p>{SHOP_TEXT.purchase.newBalance}: <SparkAmount amount={balances[product.priceSparkType]} sparkType={product.priceSparkType} /></p>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" onClick={onClose}>
              {SHOP_TEXT.purchase.continueShopping}
            </button>
            <Link className={styles.shopPrimaryLink} to="/inventory" onClick={onClose}>
              <PackageCheck size={16} aria-hidden="true" /> {SHOP_TEXT.purchase.openInventory}
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
