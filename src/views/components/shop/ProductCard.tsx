import { Check, Clock3, Eye, LockKeyhole, ShoppingBag } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SHOP_CATEGORIES } from '@/constants/shop';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import type { ShopInventoryItem, ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { durationLabel, formatSparkPrice, getProductAction, isProductNew } from '@/utils/shop';
import { ProductVisual, rarityClass } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


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
  const shopText = useLocalizedShopText();
  const actionLabels = {
    buy: shopText.actions.buy,
    insufficient: shopText.actions.insufficient,
    purchased: shopText.actions.purchased,
    activated: shopText.actions.activated,
    'sold-out': shopText.actions.soldOut,
    soon: shopText.actions.soon,
  } as const;
  const reduced = useReducedMotion();
  const { t, localize } = useUserPreferences();
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false);
  const action = getProductAction(product, balances, inventory);
  const actionLabel = readOnly ? t('shop.viewOnly') : actionLabels[action];
  const disabled = readOnly || loading || ['purchased', 'activated', 'sold-out', 'soon'].includes(action);
  const category = localize(SHOP_CATEGORIES.find((item) => item.value === product.category)?.label ?? product.category);
  const available = balances[product.priceSparkType];
  const progress = product.price === 0
    ? 100
    : Math.min(100, Math.max(0, (available / product.price) * 100));
  const promo = product.isLimited
    ? shopText.labels.limited
    : product.isFeatured
      ? shopText.labels.hit
      : isProductNew(product)
        ? shopText.labels.new
        : null;
  useEffect(() => {
    setDescriptionExpanded(false);
    setDescriptionCanExpand(false);
  }, [product.id, product.description]);
  useLayoutEffect(() => {
    if (descriptionExpanded) return;
    const description = descriptionRef.current;
    if (!description) return;
    const measure = () => setDescriptionCanExpand(description.scrollHeight > description.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(description);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [descriptionExpanded, product.description]);
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
        <div className={styles.productDescriptionBlock}>
          <p
            id={descriptionId}
            ref={descriptionRef}
            className={`${styles.productDescription} ${descriptionExpanded ? styles.productDescriptionExpanded : ''}`}
          >
            {product.description}
          </p>
          {(descriptionCanExpand || descriptionExpanded) && (
            <button
              className={styles.productDescriptionToggle}
              type="button"
              aria-expanded={descriptionExpanded}
              aria-controls={descriptionId}
              onClick={() => setDescriptionExpanded((current) => !current)}
            >
              {descriptionExpanded
                ? shopText.product.showLessDescription
                : shopText.product.showFullDescription}
            </button>
          )}
        </div>
        <div className={styles.productMeta}>
          <span>{category}</span>
          {product.durationHours && (
            <span><Clock3 size={13} aria-hidden="true" /> {durationLabel(product.durationHours)}</span>
          )}
        </div>
        <div className={styles.priceRow}>
          <SparkAmount amount={product.price} sparkType={product.priceSparkType} className={styles.price} />
          {product.stock !== null && <small>{shopText.product.remaining(product.stock)}</small>}
        </div>
        <div
          className={styles.priceProgress}
          role="progressbar"
          aria-label={shopText.product.balanceCoverage(Math.round(progress))}
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
          aria-label={shopText.aria.productAction(
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
          {loading ? shopText.actions.processing : actionLabel}
        </button>
      </div>
    </motion.article>
  );
}
