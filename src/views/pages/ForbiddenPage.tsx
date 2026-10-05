import { ArrowLeft, ShieldX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PageTransition } from '@/views/components/common/PageTransition';
import { useSpark } from '@/controllers/SparkContext';
import styles from '@/views/styles/app.module.css';

export function ForbiddenPage() {
  const { activeRole } = useSpark();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <PageTransition>
      <div className={styles.fullState}>
        <span>
          <ShieldX size={36} />
        </span>
        <p className={styles.eyebrow}>Permission-aware route</p>
        <h1>This workspace is not available</h1>
        <p>
          Your account role <strong>{activeRole}</strong> cannot open{' '}
          {from ? <code>{from}</code> : 'this page'}. Contact an administrator if your employee-directory role needs to be updated.
        </p>
        <Link className={styles.primaryButton} to="/">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>
      </div>
    </PageTransition>
  );
}
