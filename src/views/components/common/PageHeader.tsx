import type { ReactNode } from 'react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const { localize } = useUserPreferences();
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{localize(eyebrow)}</p>
        <h1>{localize(title)}</h1>
        <p>{localize(description)}</p>
      </div>
      {action && <div className={styles.pageHeaderAction}>{action}</div>}
    </header>
  );
}
