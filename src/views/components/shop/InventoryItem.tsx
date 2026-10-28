import { Check, Play, Sparkles } from 'lucide-react';
import type { ShopInventoryItem } from '@/models/shop';

import { durationLabel } from '@/utils/shop';
import { formatDateTime } from '@/utils/formatters';
import { ProductVisual } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function InventoryItem({
  item,
  loading,
  onActivate,
}: {
  item: ShopInventoryItem;
  loading: boolean;
  onActivate: (item: ShopInventoryItem) => void;
}) {
  const shopText = useLocalizedShopText();
  const canActivate = item.status === 'Owned';
  const action = item.product.productType === 'Consumable' ? shopText.actions.use : shopText.actions.activate;
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
            {shopText.inventory.statuses[item.status]}
          </span>
        </div>
        <p>{item.product.description}</p>
        <dl className={styles.inventoryMeta}>
          <div><dt>{shopText.labels.purchasedAt}</dt><dd>{formatDateTime(item.createdAt)}</dd></div>
          <div>
            <dt>{item.expiresAt ? shopText.labels.expiresAt : shopText.labels.duration}</dt>
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
          {loading ? shopText.inventory.activationInProgress : canActivate ? action : shopText.inventory.statuses[item.status]}
        </button>
      </div>
    </article>
  );
}
