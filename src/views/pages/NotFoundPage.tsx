import { SearchX } from 'lucide-react';
import { PageTransition } from '@/views/components/common/PageTransition';
import { BackNavigationButton } from '@/views/components/common/BackNavigationButton';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function NotFoundPage() {
  return (
    <PageTransition>
      <div className={styles.fullState}>
        <span>
          <SearchX size={36} />
        </span>
        <p className={styles.eyebrow}><LocalizedText>404 · Route not found</LocalizedText></p>
        <h1><LocalizedText>This Spark trail ends here</LocalizedText></h1>
        <p><LocalizedText>The requested page is not part of the C-Job Sparks workspace.</LocalizedText></p>
        <BackNavigationButton />
      </div>
    </PageTransition>
  );
}
