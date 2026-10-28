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

import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


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
  product: Pick<ShopProduct, 'name' | 'imageUrl' | 'imageSrcSet' | 'imageSizes' | 'icon' | 'rarity'>;
  size?: 'card' | 'modal' | 'inventory';
}) {
  const shopText = useLocalizedShopText();
  const Icon = ICONS[product.icon] ?? Gift;
  return (
    <div
      className={`${styles.productVisual} ${styles[`visual${size}`]} ${styles[`visual${product.rarity}`]}`}
      aria-hidden={product.imageUrl ? undefined : 'true'}
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          srcSet={product.imageSrcSet ?? undefined}
          sizes={product.imageSizes}
          alt={shopText.product.imageAlt(product.name)}
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
