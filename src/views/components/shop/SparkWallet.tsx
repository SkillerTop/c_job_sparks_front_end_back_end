import { SHOP_TEXT } from '@/constants/shop';
import type { SpendableSparkBalances } from '@/models/shop';
import { formatSparkAmount, SPENDABLE_SPARK_TYPES } from '@/utils/shop';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import styles from '@/views/styles/shop.module.css';

export function SparkWallet({
  balances,
  compact = false,
  loading = false,
}: {
  balances: SpendableSparkBalances | null;
  compact?: boolean;
  loading?: boolean;
}) {
  const readable = balances
    ? SPENDABLE_SPARK_TYPES.map((type) => `${formatSparkAmount(balances[type])} ${type} Sparks`).join(', ')
    : SHOP_TEXT.status.balanceUnavailable;
  return (
    <div
      className={`${styles.sparkWallet} ${compact ? styles.sparkWalletCompact : ''}`}
      role="status"
      aria-live="polite"
      aria-label={loading ? SHOP_TEXT.status.balanceLoading : readable}
    >
      {!compact && <small>{SHOP_TEXT.shop.balanceLabel}</small>}
      <span className={styles.sparkWalletValues} aria-hidden="true">
        {SPENDABLE_SPARK_TYPES.map((type) => (
          <span key={type} className={`${styles.sparkWalletToken} ${styles[`sparkWallet${type}`]}`}>
            <SparkIcon type={type} size={compact ? 13 : 17} animated={false} />
            <strong>{loading ? '…' : balances ? formatSparkAmount(balances[type]) : '—'}</strong>
            <span>{compact ? type.slice(0, 1) : type}</span>
          </span>
        ))}
      </span>
      {!compact && <em>{SHOP_TEXT.shop.balanceSource}</em>}
    </div>
  );
}
