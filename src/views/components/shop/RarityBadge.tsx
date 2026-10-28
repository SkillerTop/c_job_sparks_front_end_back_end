import { Sparkles } from 'lucide-react';
import { RARITY_LABELS } from '@/constants/shop';
import type { ProductRarity } from '@/models/shop';
import styles from '@/views/styles/shop.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function RarityBadge({ rarity }: { rarity: ProductRarity }) {
  return (
    <span className={`${styles.rarityBadge} ${styles[`rarityBadge${rarity}`]}`}>
      <Sparkles size={12} aria-hidden="true" /> <LocalizedText>{RARITY_LABELS[rarity]}</LocalizedText>
    </span>
  );
}
