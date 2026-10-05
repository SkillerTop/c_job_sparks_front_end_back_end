import { Check, Clock3, Eye, LockKeyhole, ShoppingBag } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { SHOP_CATEGORIES, SHOP_TEXT } from '@/constants/shop';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import type { ShopInventoryItem, ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { durationLabel, formatSparkPrice, getProductAction, isProductNew } from '@/utils/shop';
import { ProductVisual, rarityClass } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

const ACTION_LABELS = {
  buy: SHOP_TEXT.actions.buy,
  insufficient: SHOP_TEXT.actions.insufficient,
  purchased: SHOP_TEXT.actions.purchased,
  activated: SHOP_TEXT.actions.activated,
  'sold-out': SHOP_TEXT.actions.soldOut,
  soon: SHOP_TEXT.actions.soon,
} as const;

export function ProductCard({
  product,
  balances,
  inventory,
  loading,
  readOnly = false,
  onAction,
}: {
  product: ShopProduct;
  balances: SpendableSparkBalances;
  inventory: ShopInventoryItem[];
  loading: boolean;
  readOnly?: boolean;
  onAction: (product: ShopProduct, action: ReturnType<typeof getProductAction>) => void;
}) {
  const reduced = useReducedMotion();
  const { t } = useUserPreferences();
  const action = getProductAction(product, balances, inventory);
  const actionLabel = readOnly ? t('shop.viewOnly') : ACTION_LABELS[action];
  const disabled = readOnly || loading || ['purchased', 'activated', 'sold-out', 'soon'].includes(action);
  const category = SHOP_CATEGORIES.find((item) => item.value === product.category)?.label ?? product.category;
  const available = balances[product.priceSparkType];
  const progress = product.price === 0 ? 100 : Math.min(100, (available / product.price) * 100);
  const promo = product.isLimited
    ? SHOP_TEXT.labels.limited
    : product.isFeatured
      ? SHOP_TEXT.labels.hit
      : isProductNew(product)
        ? SHOP_TEXT.labels.new
        : null;
  return (
    <motion.article
      className={`${styles.productCard} ${rarityClass(product.rarity)}`}
      whileHover={reduced ? undefined : { y: -5 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <div className={styles.productMedia}>
        <ProductVisual product={product} />
        {promo && <span className={styles.promoBadge}>{promo}</span>}
        <RarityBadge rarity={product.rarity} />
      </div>
      <div className={styles.productBody}>
        <h3>{product.name}</h3>
        <p className={styles.productDescription}>{product.description}</p>
        <div className={styles.productMeta}>
          <span>{category}</span>
          {product.durationHours && (
            <span><Clock3 size={13} aria-hidden="true" /> {durationLabel(product.durationHours)}</span>
          )}
        </div>
        <div className={styles.priceRow}>
          <SparkAmount amount={product.price} sparkType={product.priceSparkType} className={styles.price} />
          {product.stock !== null && <small>{SHOP_TEXT.product.remaining(product.stock)}</small>}
        </div>
        <div
          className={styles.priceProgress}
          role="progressbar"
          aria-label={SHOP_TEXT.product.balanceCoverage(Math.round(progress))}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <button
          className={`${styles.buyButton} ${action === 'insufficient' ? styles.buyButtonMuted : ''}`}
          type="button"
          disabled={disabled}
          aria-label={SHOP_TEXT.aria.productAction(
            actionLabel,
            product.name,
            formatSparkPrice(product.price, product.priceSparkType),
          )}
          onClick={() => onAction(product, action)}
        >
          {loading ? (
            <span className={styles.shopSpinner} aria-hidden="true" />
          ) : readOnly ? (
            <Eye size={16} aria-hidden="true" />
          ) : action === 'purchased' || action === 'activated' ? (
            <Check size={16} aria-hidden="true" />
          ) : action === 'soon' ? (
            <Clock3 size={16} aria-hidden="true" />
          ) : action === 'sold-out' ? (
            <LockKeyhole size={16} aria-hidden="true" />
          ) : action === 'buy' ? (
            <ShoppingBag size={16} aria-hidden="true" />
          ) : (
            <SparkIcon type={product.priceSparkType} size={16} animated={false} />
          )}
          {loading ? SHOP_TEXT.actions.processing : actionLabel}
        </button>
      </div>
    </motion.article>
  );
}
