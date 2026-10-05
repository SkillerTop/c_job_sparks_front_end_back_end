import {
  Badge,
  Crown,
  Gem,
  Gift,
  PackageOpen,
  Palette,
  RotateCcw,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ProductRarity, ShopProduct } from '@/models/shop';
import { SHOP_TEXT } from '@/constants/shop';
import styles from '@/views/styles/shop.module.css';

const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  shield: ShieldCheck,
  palette: Palette,
  crown: Crown,
  badge: Badge,
  rotate: RotateCcw,
  package: PackageOpen,
  gem: Gem,
  gift: Gift,
};

export function ProductVisual({
  product,
  size = 'card',
}: {
  product: Pick<ShopProduct, 'name' | 'imageUrl' | 'icon' | 'rarity'>;
  size?: 'card' | 'modal' | 'inventory';
}) {
  const Icon = ICONS[product.icon] ?? Gift;
  return (
    <div
      className={`${styles.productVisual} ${styles[`visual${size}`]} ${styles[`visual${product.rarity}`]}`}
      aria-hidden={product.imageUrl ? undefined : 'true'}
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={SHOP_TEXT.product.imageAlt(product.name)}
          loading="lazy"
          decoding="async"
          width="960"
          height="960"
        />
      ) : (
        <Icon />
      )}
      <span className={styles.visualGlint} aria-hidden="true" />
    </div>
  );
}

export const rarityClass = (rarity: ProductRarity) => styles[`rarity${rarity}`];
