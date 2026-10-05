import { AlertCircle, CheckCircle2 } from 'lucide-react';
import styles from '@/views/styles/app.module.css';

export function Feedback({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.feedback} ${styles[`feedback${tone}`]}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{children}</span>
    </div>
  );
}
