import { Sparkles } from 'lucide-react';
import { RARITY_LABELS } from '@/constants/shop';
import type { ProductRarity } from '@/models/shop';
import styles from '@/views/styles/shop.module.css';

export function RarityBadge({ rarity }: { rarity: ProductRarity }) {
  return (
    <span className={`${styles.rarityBadge} ${styles[`rarityBadge${rarity}`]}`}>
      <Sparkles size={12} aria-hidden="true" /> {RARITY_LABELS[rarity]}
    </span>
  );
}
