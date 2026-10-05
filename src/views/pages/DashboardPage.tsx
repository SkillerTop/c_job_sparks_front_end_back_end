import { ArrowRight, Award, BarChart3, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BalanceCard } from '@/views/components/common/BalanceCard';
import { EmptyState } from '@/views/components/common/EmptyState';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { useDashboardController } from '@/controllers/useDashboardController';
import { useShop } from '@/controllers/ShopContext';
import { formatDate } from '@/utils/formatters';
import styles from '@/views/styles/app.module.css';

export function DashboardPage() {
  const data = useDashboardController();
  const { effects } = useShop();
  if (!data) return null;
  const { user, balances, recentTransactions, pendingApprovals, department } = data;
  const isHead = user.role === 'Head';
  const isAdmin = user.role === 'Administrator';
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <PageTransition>
      <section className={styles.welcomePanel} data-focus-surface={effects.focusMode || undefined}>
        <div>
          <p className={styles.eyebrow}>{dateLabel}</p>
          <h1>{greeting}, {user.name.split(' ')[0]}.</h1>
          <p>
            {isAdmin
              ? 'Keep recognition fair: maintain the directory, validate imports and configure the Spark rules.'
              : isHead
                ? `${pendingApprovals} decisions are waiting for your review in ${department.name}.`
                : 'Your work is creating momentum. Here is how it is being recognized.'}
          </p>
          {(effects.focusMode || effects.doubleWhiteSparks || effects.vipStatus) && (
            <div className={styles.activeRewardStrip} aria-label="Active rewards">
              {effects.focusMode && <span>Focus mode active</span>}
              {effects.doubleWhiteSparks && <span>2× White Sparks</span>}
              {effects.vipStatus && <span>VIP active</span>}
            </div>
          )}
        </div>
        <Link
          className={styles.accentButton}
          to={isAdmin ? '/admin' : isHead ? '/approvals' : '/recognition'}
        >
          {isHead || isAdmin ? <ShieldCheck size={18} /> : <Star size={18} />}
          {isAdmin ? 'Open administration' : isHead ? 'Review approvals' : 'Recognize a colleague'}
          <ArrowRight size={16} />
        </Link>
      </section>

      <section aria-labelledby="wallet-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Your balance</p>
            <h2 id="wallet-title">Spark wallet</h2>
          </div>
        </div>
        <div className={styles.balanceGrid}>
          {(['White', 'Yellow', 'Blue', 'Radiant'] as const).map((type, index) => (
            <BalanceCard key={type} type={type} value={balances[type]} index={index} />
          ))}
        </div>
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel} aria-labelledby="recent-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable history</p>
              <h2 id="recent-title">Recent activity</h2>
            </div>
            <span className={styles.subtlePill}>Latest</span>
          </div>
          <div className={styles.activityList}>
            {recentTransactions.length === 0 && (
              <EmptyState
                title="No transactions yet"
                description="Credits, conversions and disenchant requests for this employee will appear here."
              />
            )}
            {recentTransactions.map((transaction) => (
              <article key={transaction.id}>
                <span className={`${styles.activityIcon} ${styles[`tone${transaction.sparkType}`]}`}>
                  <SparkIcon
                    type={transaction.sparkType}
                    size={transaction.sparkType === 'Radiant' ? 24 : 16}
                  />
                </span>
                <div>
                  <strong>{transaction.category}</strong>
                  <p>
                    {transaction.source} · {formatDate(transaction.dateTime)}
                  </p>
                </div>
                <SparkBadge type={transaction.sparkType} amount={transaction.amount} compact />
              </article>
            ))}
          </div>
        </section>

        <aside className={styles.panel} aria-labelledby="impact-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Quarter snapshot</p>
              <h2 id="impact-title">Your impact</h2>
            </div>
            <TrendingUp size={20} />
          </div>
          <div className={styles.impactScore}>
            <div>
              <strong>{data.received.length}</strong>
              <span>achievements received</span>
            </div>
            <span>{data.settings.currentQuarter}</span>
          </div>
          <p className={styles.mutedCopy}>
            Every recognition keeps its story, even when the related Sparks are converted or spent.
          </p>
          <div className={styles.miniMetrics}>
            <div>
              <Star size={15} />
              <span>
                <strong>{data.categories}</strong> categories
              </span>
            </div>
            <div>
              <Award size={15} />
              <span>
                <strong>{data.lifetimeAchievements}</strong> lifetime achievements
              </span>
            </div>
            <div>
              <BarChart3 size={15} />
              <span>
                <strong>{data.latestPerformance?.kpi.toFixed(2) ?? '—'}</strong> latest KPI
              </span>
            </div>
          </div>
          <Link className={styles.darkButton} to={isAdmin ? '/admin' : '/achievements'}>
            {isAdmin ? 'Manage Spark rules' : 'Explore achievements'} <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </PageTransition>
  );
}
