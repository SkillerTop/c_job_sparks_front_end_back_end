import { BookOpenText } from 'lucide-react';
import type { SparkCategory } from '@/models';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import styles from '@/views/styles/app.module.css';

export function CategoryDetailsCard({ category }: { category: SparkCategory }) {
  return (
    <section className={`${styles.panel} ${styles.categoryDetailsCard}`} aria-live="polite">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}><LocalizedText>Selected category</LocalizedText></p>
          <h2><LocalizedText>{category.name}</LocalizedText></h2>
        </div>
        <BookOpenText size={20} aria-hidden="true" />
      </div>
      <div className={styles.categoryDetailsBody}>
        <SparkBadge type={category.sparkType} amount={category.amount} />
        <p><LocalizedText>{category.description}</LocalizedText></p>
      </div>
    </section>
  );
}
