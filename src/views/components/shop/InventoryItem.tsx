import { Check, Clock3, Play, Sparkles } from 'lucide-react';
import type { ShopInventoryItem } from '@/models/shop';
import { SHOP_TEXT } from '@/constants/shop';
import { durationLabel } from '@/utils/shop';
import { formatDateTime } from '@/utils/formatters';
import { ProductVisual } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import styles from '@/views/styles/shop.module.css';

export function InventoryItem({
  item,
  loading,
  onActivate,
}: {
  item: ShopInventoryItem;
  loading: boolean;
  onActivate: (item: ShopInventoryItem) => void;
}) {
  const canActivate = item.status === 'Owned';
  const action = item.product.productType === 'Consumable' ? SHOP_TEXT.actions.use : SHOP_TEXT.actions.activate;
  return (
    <article className={styles.inventoryCard}>
      <ProductVisual product={item.product} size="inventory" />
      <div className={styles.inventoryBody}>
        <div className={styles.inventoryHeading}>
          <div>
            <RarityBadge rarity={item.product.rarity} />
            <h3>{item.product.name}</h3>
          </div>
          <span className={`${styles.inventoryStatus} ${styles[`inventoryStatus${item.status}`]}`}>
            {item.status === 'Active' ? <Sparkles size={13} /> : <Check size={13} />}
            {SHOP_TEXT.inventory.statuses[item.status]}
          </span>
        </div>
        <p>{item.product.description}</p>
        <dl className={styles.inventoryMeta}>
          <div><dt>{SHOP_TEXT.labels.purchasedAt}</dt><dd>{formatDateTime(item.createdAt)}</dd></div>
          <div>
            <dt>{item.expiresAt ? SHOP_TEXT.labels.expiresAt : SHOP_TEXT.labels.duration}</dt>
            <dd>{item.expiresAt ? formatDateTime(item.expiresAt) : durationLabel(item.product.durationHours)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className={styles.shopPrimaryButton}
          disabled={!canActivate || loading}
          onClick={() => onActivate(item)}
        >
          {loading ? <span className={styles.shopSpinner} /> : canActivate ? <Play size={15} /> : <Check size={15} />}
          {loading ? SHOP_TEXT.inventory.activationInProgress : canActivate ? action : SHOP_TEXT.inventory.statuses[item.status]}
        </button>
      </div>
    </article>
  );
}
