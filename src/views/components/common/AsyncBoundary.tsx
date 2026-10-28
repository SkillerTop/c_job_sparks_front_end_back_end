import { AlertTriangle, RefreshCcw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function AsyncBoundary({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useSpark();
  if (loading)
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <span className={styles.loadingMark}>
          <Sparkles size={24} />
        </span>
        <strong><LocalizedText>Preparing your Spark workspace</LocalizedText></strong>
        <p><LocalizedText>Balances, recognition and role permissions are syncing.</LocalizedText></p>
        <div className={styles.loadingLine}>
          <span />
        </div>
      </div>
    );
  if (error)
    return (
      <div className={styles.fullState} role="alert">
        <AlertTriangle size={34} />
        <h1><LocalizedText>Workspace unavailable</LocalizedText></h1>
        <p><LocalizedText>{error}</LocalizedText></p>
        <button className={styles.primaryButton} onClick={() => void refresh()} type="button">
          <RefreshCcw size={16} /> <LocalizedText>Try again
        </LocalizedText></button>
      </div>
    );
  return children;
}
