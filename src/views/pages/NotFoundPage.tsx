import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageTransition } from '@/views/components/common/PageTransition';
import styles from '@/views/styles/app.module.css';

export function NotFoundPage() {
  return (
    <PageTransition>
      <div className={styles.fullState}>
        <span>
          <SearchX size={36} />
        </span>
        <p className={styles.eyebrow}>404 · Route not found</p>
        <h1>This Spark trail ends here</h1>
        <p>The requested page is not part of the C-Job Sparks workspace.</p>
        <Link className={styles.primaryButton} to="/">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>
      </div>
    </PageTransition>
  );
}
