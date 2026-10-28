import { Check, PackageCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/views/components/common/Modal';
import { SparkIcon } from '@/views/components/common/SparkIcon';

import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function PurchaseSuccessModal({
  product,
  balances,
  onClose,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  onClose: () => void;
}) {
  const shopText = useLocalizedShopText();
  return (
    <Modal
      open={Boolean(product)}
      title={shopText.purchase.successTitle}
      description={shopText.purchase.successDescription}
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
          <p>{shopText.purchase.newBalance}: <SparkAmount amount={balances[product.priceSparkType]} sparkType={product.priceSparkType} /></p>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" onClick={onClose}>
              {shopText.purchase.continueShopping}
            </button>
            <Link className={styles.shopPrimaryLink} to="/inventory" onClick={onClose}>
              <PackageCheck size={16} aria-hidden="true" /> {shopText.purchase.openInventory}
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
