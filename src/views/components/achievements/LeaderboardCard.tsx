import { ChevronDown, ChevronUp, Crown, RefreshCw, Sparkles, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppSnapshot } from '@/models';
import type { LeaderboardEntry } from '@/models/leaderboard';
import { useLeaderboardController } from '@/controllers/useLeaderboardController';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import { SelectField } from '@/views/components/ui/SelectField';
import appStyles from '@/views/styles/app.module.css';
import styles from '@/views/styles/leaderboard.module.css';

const initials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'CJ';

function RankingRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li className={entry.isCurrentUser ? styles.currentRow : undefined}>
      <span className={styles.position} aria-label={`Rank ${entry.rank}`}>
        {entry.rank <= 3 ? <span className={styles.medal}>{entry.rank}</span> : entry.rank}
      </span>
      <span className={styles.avatar} aria-hidden="true">{initials(entry.name)}</span>
      <span className={styles.person}>
        <strong>{entry.isCurrentUser ? <LocalizedText>You</LocalizedText> : entry.name}</strong>
        <small>{entry.title}</small>
      </span>
      <span className={styles.score}>
        <Sparkles size={13} aria-hidden="true" />
        <strong>{entry.amount}</strong>
      </span>
    </li>
  );
}

export function LeaderboardCard({ snapshot, currentUserId }: {
  snapshot: AppSnapshot;
  currentUserId: string;
}) {
  const controller = useLeaderboardController(snapshot, currentUserId);
  const { localize } = useUserPreferences();
  const [expanded, setExpanded] = useState(false);
  const data = controller.data;
  const departments = data?.departments ?? snapshot.departments
    .filter((department) => department.active)
    .map(({ id, name }) => ({ id, name }));
  const leaders = useMemo(
    () => data?.topTen.slice(0, expanded ? 10 : 3) ?? [],
    [data, expanded],
  );
  const current = data?.currentUser ?? null;
  const amountToTopTen = current && current.rank > 10
    ? Math.max(0, data!.topTenThreshold - current.amount + 1)
    : 0;
  const progress = current
    ? current.rank <= 10
      ? 100
      : data!.topTenThreshold > 0
        ? Math.min(100, Math.round((current.amount / data!.topTenThreshold) * 100))
        : 0
    : 0;

  return (
    <aside className={`${appStyles.panel} ${styles.card}`} aria-labelledby="leaderboard-title" aria-busy={controller.loading}>
      <div className={styles.header}>
        <div>
          <p className={appStyles.eyebrow}><LocalizedText>Your Spark journey</LocalizedText></p>
          <h2 id="leaderboard-title"><LocalizedText>Your place in the team</LocalizedText></h2>
        </div>
        <span className={styles.trophy} aria-hidden="true"><Trophy size={20} /></span>
      </div>

      <div className={styles.filters}>
        <SelectField
          value={controller.departmentId}
          onChange={(value) => {
            controller.setDepartmentId(value);
            setExpanded(false);
          }}
          options={[
            { value: '', label: 'All users' },
            ...departments.map((department) => ({ value: department.id, label: department.name })),
          ]}
          ariaLabel="Filter leaderboard by department"
          variant="filter"
        />
      </div>

      {controller.error && (
        <div className={styles.error} role="alert">
          <span>{controller.error}</span>
          <button type="button" onClick={controller.retry}>
            <RefreshCw size={14} /> <LocalizedText>Try again</LocalizedText>
          </button>
        </div>
      )}

      {!data && controller.loading ? (
        <div className={styles.loading} aria-label={localize('Loading leaderboard')}>
          <span />
          <span />
          <span />
        </div>
      ) : data && data.totalUsers === 0 ? (
        <div className={styles.empty}>
          <Trophy size={24} />
          <strong><LocalizedText>No leaderboard data</LocalizedText></strong>
          <span><LocalizedText>No active employees match this department.</LocalizedText></span>
        </div>
      ) : data ? (
        <>
          <div className={styles.boardGrid}>
            <section className={styles.summary} aria-label={localize('Your leaderboard position')}>
            {current ? (
              <>
                <div className={styles.rankLine}>
                  <strong>#{current.rank}</strong>
                  <span><LocalizedText>of </LocalizedText>{data.totalUsers} <LocalizedText>teammates</LocalizedText></span>
                </div>
                <p className={styles.movement}>
                  {current.rankChange > 0 ? (
                    <><TrendingUp size={15} /> <LocalizedText>Up </LocalizedText>{current.rankChange}<LocalizedText> places this month</LocalizedText></>
                  ) : current.rankChange < 0 ? (
                    <><TrendingDown size={15} /> <LocalizedText>Down </LocalizedText>{Math.abs(current.rankChange)}<LocalizedText> places this month</LocalizedText></>
                  ) : (
                    <><LocalizedText>No position change this month</LocalizedText></>
                  )}
                </p>
                <div className={styles.progressLabel}>
                  <span>
                    {current.rank <= 10
                      ? <LocalizedText>You are in the Top 10</LocalizedText>
                      : <><LocalizedText>Progress to the Top 10</LocalizedText> · {current.amount}/{data.topTenThreshold || '—'}</>}
                  </span>
                  <strong>{progress}%</strong>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
                {current.rank > 10 && (
                  <small className={styles.progressHint}>
                    {data.topTenThreshold > 0
                      ? <><LocalizedText>Earn </LocalizedText>{amountToTopTen} <LocalizedText>Sparks to reach the Top 10.</LocalizedText></>
                      : <LocalizedText>Earn your first Spark to start climbing the leaderboard.</LocalizedText>}
                  </small>
                )}
              </>
            ) : (
              <div className={styles.outsideScope}>
                <LocalizedText>You are not part of the selected department, but you can still view its leaders.</LocalizedText>
              </div>
            )}
            </section>

            {current && data.aroundCurrentUser.length > 0 && (
              <section className={styles.rankingSection} aria-labelledby="around-you-title">
                <h3 id="around-you-title"><LocalizedText>Around you</LocalizedText></h3>
                <ol className={styles.rankingList}>
                  {data.aroundCurrentUser.map((entry) => (
                    <RankingRow key={entry.employeeId} entry={entry} />
                  ))}
                </ol>
              </section>
            )}

            <section className={styles.rankingSection} aria-labelledby="leaders-title">
              <div className={styles.sectionTitle}>
                <h3 id="leaders-title"><LocalizedText>Leading the way</LocalizedText></h3>
                <Crown size={16} aria-hidden="true" />
              </div>
              <ol className={styles.rankingList}>
                {leaders.map((entry) => (
                  <RankingRow key={entry.employeeId} entry={entry} />
                ))}
              </ol>
              {data.topTen.length > 3 && (
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  <LocalizedText>{expanded ? 'Show top 3' : 'See top 10'}</LocalizedText>
                  {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              )}
            </section>
          </div>
          <p className={styles.disclaimer}>
            <LocalizedText>Leaderboard score: White ×1, Yellow ×10, Blue ×100. Radiant Sparks are excluded.</LocalizedText>
          </p>
        </>
      ) : null}
    </aside>
  );
}
