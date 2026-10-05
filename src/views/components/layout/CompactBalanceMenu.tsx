import { useEffect, useRef, useState } from 'react';
import { ChevronDown, WalletCards } from 'lucide-react';
import type { SpendableSparkBalances } from '@/models/shop';
import { formatSparkAmount, SPENDABLE_SPARK_TYPES } from '@/utils/shop';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

export function CompactBalanceMenu({
  balances,
  loading,
}: {
  balances: SpendableSparkBalances | null;
  loading: boolean;
}) {
  const { t } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const total = balances ? SPENDABLE_SPARK_TYPES.reduce((sum, type) => sum + balances[type], 0) : 0;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.compactBalance} ref={root}>
      <button
        type="button"
        className={styles.compactBalanceTrigger}
        onClick={() => setOpen((value) => !value)}
        aria-label={balances ? t('shell.balanceTotal', { count: formatSparkAmount(total) }) : t('shell.balance')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <WalletCards size={17} aria-hidden="true" />
        <strong>{loading ? '…' : balances ? formatSparkAmount(total) : '—'}</strong>
        <span>Sparks</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.compactBalancePopover} role="dialog" aria-label={t('shell.balanceDetails')}>
          <p>{t('shell.balanceDetails')}</p>
          {SPENDABLE_SPARK_TYPES.map((type) => (
            <div key={type}>
              <span><SparkIcon type={type} size={17} animated={false} /> {type}</span>
              <strong>{loading ? '…' : balances ? formatSparkAmount(balances[type]) : '—'}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
