import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const { localize } = useUserPreferences();
  return (
    <div className={styles.emptyState}>
      <span>
        <Inbox size={22} />
      </span>
      <h3>{localize(title)}</h3>
      <p>{localize(description)}</p>
      {action}
    </div>
  );
}
