import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
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
  return (
    <div className={styles.emptyState}>
      <span>
        <Inbox size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
