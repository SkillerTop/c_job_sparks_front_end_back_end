import { AlertTriangle, RefreshCcw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import styles from '@/views/styles/app.module.css';

export function AsyncBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useSpark();
  if (loading)
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <span className={styles.loadingMark}>
          <Sparkles size={24} />
        </span>
        <strong>Preparing your Spark workspace</strong>
        <p>Balances, recognition and role permissions are syncing.</p>
        <div className={styles.loadingLine}>
          <span />
        </div>
      </div>
    );
  if (error)
    return (
      <div className={styles.fullState} role="alert">
        <AlertTriangle size={34} />
        <h1>Workspace unavailable</h1>
        <p>{error}</p>
        <button className={styles.primaryButton} onClick={() => void refresh()} type="button">
          <RefreshCcw size={16} /> Try again
        </button>
      </div>
    );
  return children;
}
