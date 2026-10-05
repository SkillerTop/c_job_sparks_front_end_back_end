import { ShieldCheck } from 'lucide-react';
import { Modal } from '@/views/components/common/Modal';
import { Feedback } from '@/views/components/common/Feedback';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { SHOP_TEXT } from '@/constants/shop';
import type { ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { ProductVisual } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

export function PurchaseModal({
  product,
  balances,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const available = product ? balances[product.priceSparkType] : 0;
  const after = product ? available - product.price : available;
  return (
    <Modal
      open={Boolean(product)}
      title={SHOP_TEXT.purchase.title}
      description={SHOP_TEXT.purchase.serverCheck}
      onClose={() => !loading && onClose()}
    >
      {product && (
        <div className={styles.purchaseModalBody}>
          <div className={styles.purchaseProduct}>
            <ProductVisual product={product} size="modal" />
            <div>
              <RarityBadge rarity={product.rarity} />
              <h3>{product.name}</h3>
              <p>{product.description}</p>
            </div>
          </div>
          {error && <Feedback tone="error">{error}</Feedback>}
          <dl className={styles.purchaseSummary}>
            <div>
              <dt>{SHOP_TEXT.labels.price}</dt>
              <dd><SparkAmount amount={product.price} sparkType={product.priceSparkType} /></dd>
            </div>
            <div>
              <dt>{SHOP_TEXT.purchase.currentBalance}</dt>
              <dd><SparkAmount amount={available} sparkType={product.priceSparkType} /></dd>
            </div>
            <div className={styles.purchaseAfter}>
              <dt>{SHOP_TEXT.purchase.afterPurchase}</dt>
              <dd><SparkAmount amount={Math.max(0, after)} sparkType={product.priceSparkType} /></dd>
            </div>
          </dl>
          <p className={styles.secureNote}>
            <ShieldCheck size={16} aria-hidden="true" /> {SHOP_TEXT.purchase.atomicOperation}
          </p>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" disabled={loading} onClick={onClose}>
              {SHOP_TEXT.purchase.cancel}
            </button>
            <button className={styles.shopPrimaryButton} type="button" disabled={loading} onClick={onConfirm}>
              {loading ? <span className={styles.shopSpinner} aria-hidden="true" /> : (
                <SparkIcon type={product.priceSparkType} size={16} animated={false} />
              )}
              {loading ? SHOP_TEXT.purchase.processing : SHOP_TEXT.purchase.confirm}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
