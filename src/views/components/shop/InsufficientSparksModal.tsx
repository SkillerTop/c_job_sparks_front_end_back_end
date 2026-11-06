import { Link } from 'react-router-dom';
import { Modal } from '@/views/components/common/Modal';

import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { getMissingPriceComponents, getProductPriceComponents } from '@/utils/shop';
import { ProductVisual } from './ProductVisual';
import { SparkPrice } from './SparkPrice';
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
  const priceComponents = product ? getProductPriceComponents(product) : [];
  const missingComponents = product ? getMissingPriceComponents(product, balances) : [];
  const firstMissing = missingComponents[0] ?? { missing: 0, sparkType: 'White' as const };
  return (
    <Modal
      open={Boolean(product)}
      title={shopText.purchase.insufficientTitle}
      description={shopText.purchase.insufficientDescription(firstMissing.missing, firstMissing.sparkType)}
      onClose={onClose}
    >
      {product && (
        <div className={styles.insufficientBody}>
          <ProductVisual product={product} size="inventory" />
          <div className={styles.insufficientNumbers}>
            <span>{shopText.purchase.balance} <SparkPrice components={priceComponents.map((component) => ({
              sparkType: component.sparkType,
              amount: balances[component.sparkType],
            }))} /></span>
            <span>{shopText.labels.price} <SparkPrice product={product} /></span>
            <span className={styles.missingSparks}>
              {shopText.purchase.missing} <SparkPrice components={missingComponents.map((component) => ({
                sparkType: component.sparkType,
                amount: component.missing,
              }))} />
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
