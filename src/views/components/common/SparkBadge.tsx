import { SparkIcon } from './SparkIcon';
import type { SparkType } from '@/models';
import styles from '@/views/styles/app.module.css';

export function SparkBadge({
  type,
  amount,
  compact = false,
}: {
  type: SparkType;
  amount?: number;
  compact?: boolean;
}) {
  return (
    <span className={`${styles.sparkBadge} ${styles[`tone${type}`]} ${compact ? styles.compactBadge : ''}`}>
      <SparkIcon
        type={type}
        size={type === 'Radiant' ? (compact ? 14 : 16) : compact ? 12 : 14}
        animated={!compact}
      />
      {typeof amount === 'number' ? `${amount > 0 ? '+' : ''}${amount} ` : ''}
      {type}
    </span>
  );
}
