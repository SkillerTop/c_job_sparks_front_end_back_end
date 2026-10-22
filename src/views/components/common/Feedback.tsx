import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

export function Feedback({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const { localize } = useUserPreferences();
  return (
    <div
      className={`${styles.feedback} ${styles[`feedback${tone}`]}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{typeof children === 'string' ? localize(children) : children}</span>
    </div>
  );
}
