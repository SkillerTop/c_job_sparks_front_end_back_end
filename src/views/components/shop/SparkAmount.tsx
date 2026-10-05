import { SparkIcon } from '@/views/components/common/SparkIcon';
import type { SpendableSparkType } from '@/models/shop';
import { formatSparkAmount } from '@/utils/shop';
import styles from '@/views/styles/shop.module.css';

export function SparkAmount({
  amount,
  sparkType,
  signed = false,
  compact = false,
  className = '',
}: {
  amount: number;
  sparkType: SpendableSparkType;
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const sign = signed ? (amount > 0 ? '+' : amount < 0 ? '−' : '') : '';
  const readableAmount = `${sign}${formatSparkAmount(Math.abs(amount))}`;
  return (
    <span
      className={`${styles.sparkAmount} ${styles[`sparkAmount${sparkType}`]} ${compact ? styles.sparkAmountCompact : ''} ${className}`}
      aria-label={`${readableAmount} ${sparkType} ${Math.abs(amount) === 1 ? 'Spark' : 'Sparks'}`}
    >
      <SparkIcon type={sparkType} size={compact ? 13 : 17} animated={false} />
      <strong>{readableAmount}</strong>
      {!compact && <span>{sparkType}</span>}
    </span>
  );
}
