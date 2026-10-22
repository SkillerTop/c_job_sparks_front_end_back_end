import { ArrowLeft, ShieldX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PageTransition } from '@/views/components/common/PageTransition';
import { useSpark } from '@/controllers/SparkContext';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


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
        <p className={styles.eyebrow}><LocalizedText>Permission-aware route</LocalizedText></p>
        <h1><LocalizedText>This workspace is not available</LocalizedText></h1>
        <p>
          <LocalizedText>Your account role </LocalizedText><strong>{activeRole}</strong> <LocalizedText>cannot open</LocalizedText>{' '}
          <LocalizedText>{from ? <code>{from}</code> : 'this page'}</LocalizedText><LocalizedText>. Contact an administrator if your employee-directory role needs to be updated.
        </LocalizedText></p>
        <Link className={styles.primaryButton} to="/">
          <ArrowLeft size={16} /> <LocalizedText>Back to dashboard
        </LocalizedText></Link>
      </div>
    </PageTransition>
  );
}
