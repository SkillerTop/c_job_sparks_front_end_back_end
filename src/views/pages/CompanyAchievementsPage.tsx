import { CalendarDays, Layers3, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { SparkType } from '@/models';
import { EmptyState } from '@/views/components/common/EmptyState';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { formatDate } from '@/utils/formatters';
import styles from '@/views/styles/app.module.css';

type SparkFilter = 'All' | SparkType;

export function CompanyAchievementsPage() {
  const { snapshot } = useSpark();
  const { t } = useUserPreferences();
  const [query, setQuery] = useState('');
  const [sparkFilter, setSparkFilter] = useState<SparkFilter>('All');

  const employees = useMemo(
    () => new Map(snapshot!.employees.map((employee) => [employee.id, employee])),
    [snapshot],
  );
  const departments = useMemo(
    () => new Map(snapshot!.departments.map((department) => [department.id, department])),
    [snapshot],
  );
  const achievements = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return snapshot!.achievements
      .filter((achievement) => {
        const employee = employees.get(achievement.employeeId);
        if (!employee || !['Employee', 'Coordinator'].includes(employee.role)) return false;
        if (sparkFilter !== 'All' && achievement.sparkType !== sparkFilter) return false;
        if (!normalizedQuery) return true;
        const department = departments.get(employee.departmentId)?.name ?? '';
        return [
          employee.name,
          employee.title,
          employee.role,
          department,
          achievement.title,
          achievement.category,
          achievement.description,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [departments, employees, query, snapshot, sparkFilter]);

  const personName = (id: string) => employees.get(id)?.name ?? 'C-Job';

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('companyAchievements.eyebrow')}
        title={t('companyAchievements.title')}
        description={t('companyAchievements.description')}
      />

      <section className={styles.panel} aria-label={t('companyAchievements.search')}>
        <div className={styles.filterBar}>
          <label className={styles.searchField}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('companyAchievements.search')}
              aria-label={t('companyAchievements.search')}
            />
          </label>
          <SelectField
            value={sparkFilter}
            onChange={setSparkFilter}
            options={(['All', 'White', 'Yellow', 'Blue', 'Radiant'] as SparkFilter[]).map((value) => ({
              value,
              label: value === 'All' ? t('companyAchievements.allSparks') : value,
            }))}
            ariaLabel={t('companyAchievements.allSparks')}
            icon={<Layers3 size={15} />}
            variant="filter"
          />
        </div>
        <p className={styles.mutedCopy}>{t('companyAchievements.results', { count: achievements.length })}</p>
      </section>

      {achievements.length === 0 ? (
        <EmptyState
          title={t('companyAchievements.emptyTitle')}
          description={t('companyAchievements.emptyDescription')}
        />
      ) : (
        <div className={styles.achievementGrid}>
          {achievements.map((achievement) => {
            const employee = employees.get(achievement.employeeId)!;
            const department = departments.get(employee.departmentId)?.name ?? 'C-Job';
            const role = employee.role === 'Employee' ? t('companyAchievements.engineer') : t('role.Coordinator');
            return (
              <article
                className={`${styles.achievementCard} ${styles[`tone${achievement.sparkType}`]}`}
                key={achievement.id}
              >
                <div className={styles.achievementTop}>
                  <SparkBadge type={achievement.sparkType} />
                </div>
                <p className={styles.eyebrow}>{role} · {department}</p>
                <h2>{employee.name}</h2>
                <strong className={styles.achievementReason}>{achievement.title || achievement.category}</strong>
                <p>{achievement.description}</p>
                <footer>
                  <time dateTime={achievement.date}>
                    <CalendarDays size={14} aria-hidden="true" />
                    {formatDate(achievement.date)}
                  </time>
                  <strong>{t('companyAchievements.awardedBy', { name: personName(achievement.awardedBy) })}</strong>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
