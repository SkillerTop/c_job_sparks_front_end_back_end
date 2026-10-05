import { Gauge, Target } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/views/components/common/EmptyState';
import { useSpark } from '@/controllers/SparkContext';
import { quarterOrder } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';

export function PerformanceOverview() {
  const { snapshot, currentUserId } = useSpark();
  const reduced = useReducedMotion();
  const performance = snapshot!.performance
    .filter((item) => item.employeeId === currentUserId)
    .sort((a, b) => quarterOrder(a.quarter) - quarterOrder(b.quarter));
  const current = performance.at(-1);
  const chartData = performance.map((item) => ({
    quarter: item.quarter,
    KPI: item.kpi || null,
    'Personal cards': item.evaluation || null,
  }));

  return (
    <section className={styles.performanceOverview} id="performance" aria-labelledby="performance-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Automatic recognition</p>
          <h2 id="performance-title">Performance &amp; automatic rewards</h2>
        </div>
      </div>
      <div className={styles.performanceExplanation}>
        <p>
          Scores come from quarterly KPI and Personal Cards results imported and validated by an administrator.
          White Sparks are awarded from the published score bands after validation; an active Quality Gate blocks
          the credit.
        </p>
        <Link className={styles.textLink} to="/rules#performance-rules-title">
          How rewards are calculated
        </Link>
      </div>
      {!current ? (
        <EmptyState
          title="No performance data yet"
          description="Validated KPI and Personal Cards results will appear here after the quarterly import."
        />
      ) : (
        <>
          <div className={`${styles.metricGrid} ${styles.metricGridTwo}`}>
            <article className={styles.metricCard}>
              <span>
                <Gauge size={19} />
              </span>
              <div>
                <p>Latest KPI</p>
                <strong>{current.kpiImported || current.kpi > 0 ? current.kpi.toFixed(2) : '—'}</strong>
                <small>
                  +{current.kpiReward} White · {current.quarter}
                </small>
              </div>
            </article>
            <article className={styles.metricCard}>
              <span>
                <Target size={19} />
              </span>
              <div>
                <p>Personal cards reward</p>
                <strong>
                  {current.evaluationImported || current.evaluation > 0 ? current.evaluation.toFixed(2) : '—'}
                </strong>
                <small>
                  +{current.evaluationReward} White · {current.quarter}
                </small>
              </div>
            </article>
          </div>
          <div className={styles.panel} aria-labelledby="trend-title">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Validated results</p>
                <h3 id="trend-title">Quarterly performance</h3>
              </div>
              <span className={styles.subtlePill}>KPI: left · Personal Cards: right</span>
            </div>
            <div className={styles.chartWrap} aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                initialDimension={{ width: 720, height: 288 }}
              >
                <AreaChart data={chartData} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kpi-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-kpi)" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="var(--chart-kpi)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="quarter"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: 'var(--muted)' }}
                  />
                  <YAxis
                    yAxisId="kpi"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: 'var(--muted)' }}
                    width={40}
                    domain={['auto', 'auto']}
                  />
                  <YAxis
                    yAxisId="evaluation"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tick={{ fill: 'var(--muted)' }}
                    width={26}
                    domain={[0, 5]}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--line-strong)',
                      background: 'var(--surface-strong)',
                      color: 'var(--ink)',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--ink)', fontWeight: 700 }}
                    itemStyle={{ color: 'var(--ink)' }}
                    cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '4 4' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink)' }} />
                  <Area
                    yAxisId="evaluation"
                    type="monotone"
                    dataKey="Personal cards"
                    stroke="var(--chart-evaluation)"
                    strokeWidth={2}
                    fill="transparent"
                    isAnimationActive={!reduced}
                  />
                  <Area
                    yAxisId="kpi"
                    type="monotone"
                    dataKey="KPI"
                    stroke="var(--chart-kpi)"
                    strokeWidth={2.4}
                    fill="url(#kpi-fill)"
                    isAnimationActive={!reduced}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.srOnly}>
              <table>
                <caption>Quarterly performance values</caption>
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th>KPI</th>
                    <th>Personal cards</th>
                    <th>White rewards</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((item) => (
                    <tr key={item.id}>
                      <th>{item.quarter}</th>
                      <td>{item.kpi || 'Not imported'}</td>
                      <td>{item.evaluation || 'Not imported'}</td>
                      <td>{item.kpiReward + item.evaluationReward}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
