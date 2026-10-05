import { ArrowRight, CalendarDays, History, Layers3 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BalanceCard } from '@/views/components/common/BalanceCard';
import { EmptyState } from '@/views/components/common/EmptyState';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { useSpark } from '@/controllers/SparkContext';
import { PERFORMANCE_ROLES } from '@/constants/app';
import type { SparkType } from '@/models';
import { formatDate } from '@/utils/formatters';
import { calculateLifetimeEarnings } from '@/utils/sparkRules';
import { PerformanceOverview } from '@/views/components/achievements/PerformanceOverview';
import styles from '@/views/styles/app.module.css';

export function AchievementsPage() {
  const { snapshot, currentUserId, activeRole } = useSpark();
  const [filter, setFilter] = useState<'All' | SparkType>('All');
  const [expanded, setExpanded] = useState(false);
  const items = snapshot!.achievements
    .filter((item) => item.employeeId === currentUserId && (filter === 'All' || item.sparkType === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const visibleItems = expanded ? items : items.slice(0, 3);
  const lifetime = calculateLifetimeEarnings(snapshot!.transactions, currentUserId);
  const personName = (id: string) => snapshot!.employees.find((item) => item.id === id)?.name ?? 'C-Job';
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Permanent record"
        title="My achievements"
        description="Achievement cards preserve the story behind every approved recognition, even after the related Sparks are spent."
        action={
          <SelectField
            value={filter}
            onChange={(value) => {
              setFilter(value as 'All' | SparkType);
              setExpanded(false);
            }}
            options={['All', 'White', 'Yellow', 'Blue', 'Radiant'].map((value) => ({
              value: value as 'All' | SparkType,
              label: value,
            }))}
            ariaLabel="Filter achievements by Spark type"
            icon={<Layers3 size={15} />}
            variant="filter"
          />
        }
      />
      {PERFORMANCE_ROLES.includes(activeRole) && <PerformanceOverview />}
      <section aria-labelledby="lifetime-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Since your account was created</p>
            <h2 id="lifetime-title">Lifetime earnings</h2>
          </div>
        </div>
        <div className={styles.balanceGridCompact}>
          {(['White', 'Yellow', 'Blue', 'Radiant'] as SparkType[]).map((type, index) => (
            <BalanceCard
              key={type}
              type={type}
              value={lifetime[type]}
              index={index}
              caption="Recognition earned for all time"
            />
          ))}
        </div>
        <p className={styles.mutedCopy}>
          Lifetime earnings count completed recognition credits. Conversion credits are excluded to avoid
          counting the same value twice, and import corrections are netted automatically.
        </p>
      </section>
      {items.length === 0 ? (
        <EmptyState
          title="No achievements in this view"
          description="Choose another Spark type to see your recognition history."
        />
      ) : (
        <div className={styles.achievementGrid}>
          {visibleItems.map((item) => (
            <article className={`${styles.achievementCard} ${styles[`tone${item.sparkType}`]}`} key={item.id}>
              <div className={styles.achievementTop}>
                <SparkBadge type={item.sparkType} />
              </div>
              <h2>{item.category}</h2>
              <p>{item.description}</p>
              <footer>
                <time dateTime={item.date}>
                  <CalendarDays size={14} />
                  {formatDate(item.date)}
                </time>
                <strong>Awarded by {personName(item.awardedBy)}</strong>
              </footer>
            </article>
          ))}
        </div>
      )}
      <div className={styles.achievementActions}>
        <Link className={styles.darkButton} to="/sparks">
          <History size={16} /> View Spark Ledger <ArrowRight size={15} />
        </Link>
        {items.length > 3 && (
          <button
            type="button"
            className={styles.secondaryButton}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : `Show more achievements (${items.length - 3})`}
          </button>
        )}
      </div>
    </PageTransition>
  );
}
