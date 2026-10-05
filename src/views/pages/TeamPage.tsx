import { ChevronDown, Coins, Search, ShieldAlert, Star } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { QualityGateDialog } from '@/views/components/common/QualityGateDialog';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { useSpark } from '@/controllers/SparkContext';
import type { Employee } from '@/models';
import { selectTeamMembers } from '@/models/selectors';
import { calculateBalances, formatMoney, isQualityGateActive } from '@/utils/sparkRules';
import { formatDate } from '@/utils/formatters';
import { todayIso } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';

export function TeamPage() {
  const { snapshot, activeRole, currentUserId, toggleQualityGate } = useSpark();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const reducedMotion = useReducedMotion();
  const canPeerRecognize = activeRole !== 'Head';
  const current = snapshot!.employees.find((item) => item.id === currentUserId)!;
  const members = useMemo(
    () =>
      selectTeamMembers(snapshot!, currentUserId, activeRole).filter(
        (item) =>
          item.id !== currentUserId &&
          `${item.name} ${item.title}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [snapshot, currentUserId, activeRole, query],
  );
  const gateFor = (id: string) =>
    snapshot!.qualityGates.find(
      (gate) => gate.employeeId === id && gate.status === 'Active' && gate.endDate >= todayIso(),
    );
  const accounting = snapshot!.disenchantRequests.filter(
    (request) => request.departmentId === current.departmentId,
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const departmentGates = snapshot!.qualityGates
    .filter((gate) =>
      snapshot!.employees.some(
        (employee) => employee.id === gate.employeeId && employee.departmentId === current.departmentId,
      ),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const pageTitle =
    activeRole === 'GPM'
      ? 'Company team'
      : activeRole === 'Coordinator'
        ? 'Department team'
        : 'Department workspace';
  return (
    <PageTransition>
      <PageHeader
        eyebrow={`${activeRole} scope`}
        title={pageTitle}
        description={
          activeRole === 'Head'
            ? 'Department balances, Quality Gates and accounting requests, with a complete audit trail.'
            : activeRole === 'GPM'
              ? 'Find any active colleague across C-Job. Spark balances remain private.'
              : 'Work with active colleagues in your department. Spark balances remain private.'
        }
        action={
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search people</span>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setExpandedMemberId(null);
              }}
              placeholder="Search people"
            />
          </label>
        }
      />
      {message && <Feedback tone="success">{message}</Feedback>}
      {members.length === 0 ? (
        <EmptyState title="No people found" description="Try a different search term." />
      ) : (
        <div className={styles.peopleGrid}>
          {members.map((member) => {
            const gate = gateFor(member.id);
            const balances = calculateBalances(snapshot!.transactions, member.id);
            const activeGate = isQualityGateActive(member.id, snapshot!.qualityGates);
            const expanded = canPeerRecognize && expandedMemberId === member.id;
            const recognitionActionId = `recognize-${member.id}`;
            const toggleMember = () => {
              setExpandedMemberId((currentId) => (currentId === member.id ? null : member.id));
            };
            return (
              <article
                className={`${styles.personCard} ${expanded ? styles.personCardSelected : ''}`}
                key={member.id}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a, button, input, textarea, select')) return;
                  if (canPeerRecognize) toggleMember();
                }}
              >
                <header>
                  <span className={styles.avatarLarge}>{member.initials}</span>
                  <div className={styles.personIdentity}>
                    <h2>{member.name}</h2>
                    <p>{member.title}</p>
                    <span>{snapshot!.departments.find((item) => item.id === member.departmentId)?.name}</span>
                  </div>
                  <div className={styles.personCardControls}>
                    <StatusBadge status={activeGate ? 'Blocked' : gate ? 'Scheduled' : 'Available'} />
                    {canPeerRecognize && (
                      <button
                        className={styles.personCardToggle}
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={expanded ? recognitionActionId : undefined}
                        aria-label={`${expanded ? 'Hide' : 'Show'} recognition action for ${member.name}`}
                        onClick={toggleMember}
                      >
                        <ChevronDown size={17} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </header>
                {activeRole === 'Head' ? (
                  <div className={styles.personBalances}>
                    {(['White', 'Yellow', 'Blue', 'Radiant'] as const).map((type) => (
                      <div key={type}>
                        <span>{type}</span>
                        <strong>{balances[type]}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.privateNote}>
                    <ShieldAlert size={15} />
                    Spark balance stays private for this role.
                  </p>
                )}
                <footer>
                  <span className={styles.gateMeta}>
                    {gate ? `Gate until ${formatDate(gate.endDate)}` : 'No active Quality Gate'}
                  </span>
                  <div className={styles.personActions}>
                    <AnimatePresence initial={false}>
                      {canPeerRecognize && expanded && (
                        <motion.div
                          id={recognitionActionId}
                          className={styles.personRecognitionAction}
                          initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}
                        >
                          <Link
                            className={styles.recognizeLink}
                            to={`/recognition?recipient=${encodeURIComponent(member.id)}`}
                            aria-label={`Recognize ${member.name}`}
                          >
                            <Star size={15} aria-hidden="true" />
                            Recognize a colleague
                          </Link>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {activeRole === 'Head' && (
                      <button
                        className={gate ? styles.secondaryButton : styles.dangerGhost}
                        type="button"
                        onClick={() => setSelected(member)}
                      >
                        <ShieldAlert size={15} />
                        {gate ? 'Cancel gate' : 'Set gate'}
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {activeRole === 'Head' && (
        <>
          <section className={`${styles.panel} ${styles.accountingPanel}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Department quality history</p>
                <h2>Quality Gates</h2>
              </div>
              <ShieldAlert size={20} />
            </div>
            {departmentGates.length === 0 ? (
              <EmptyState
                title="No Quality Gates"
                description="Set a gate from an employee card when a documented remediation period is needed."
              />
            ) : (
              <div className={styles.tableScroller} tabIndex={0} aria-label="Scrollable Quality Gate history">
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Department Quality Gate history</caption>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Period</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentGates.map((gate) => (
                      <tr key={gate.id}>
                        <td>{snapshot!.employees.find((item) => item.id === gate.employeeId)?.name}</td>
                        <td>
                          {formatDate(gate.startDate)} – {formatDate(gate.endDate)}
                        </td>
                        <td>{gate.reason}</td>
                        <td>
                          <StatusBadge
                            status={
                              gate.status === 'Cancelled'
                                ? 'Cancelled'
                                : gate.endDate < todayIso()
                                  ? 'Expired'
                                  : gate.startDate > todayIso()
                                    ? 'Scheduled'
                                    : 'Active'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section
            className={`${styles.panel} ${styles.accountingPanel}`}
            id="department-disenchant-requests"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>
                  Monthly accounting ·{' '}
                  {snapshot!.departments.find((item) => item.id === current.departmentId)?.name}
                </p>
                <h2>Disenchant requests</h2>
              </div>
              <Coins size={20} />
            </div>
            {accounting.length === 0 ? (
              <EmptyState
                title="No accounting requests yet"
                description="Disenchant requests from employees in this department will appear here. This frontend does not send payments."
              />
            ) : (
              <div className={styles.tableScroller} tabIndex={0} aria-label="Scrollable accounting requests">
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Department disenchant requests for accounting</caption>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Employee</th>
                      <th>Sparks</th>
                      <th>Rate</th>
                      <th>Money value</th>
                      <th>Period</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounting.map((request) => (
                      <tr key={request.id}>
                        <td>{request.id}</td>
                        <td>{snapshot!.employees.find((item) => item.id === request.employeeId)?.name}</td>
                        <td>
                          {request.amount} {request.sparkType}
                        </td>
                        <td>{Math.round(request.rate * 100)}%</td>
                        <td>{formatMoney(request.moneyValue, request.currency)}</td>
                        <td>{request.accountingPeriod}</td>
                        <td>{formatDate(request.createdAt)}</td>
                        <td>
                          <StatusBadge status={request.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {selected && (
        <QualityGateDialog
          key={selected.id}
          employee={selected}
          gate={gateFor(selected.id)}
          onClose={() => setSelected(null)}
          onConfirm={async (input) => {
            await toggleQualityGate(selected.id, input);
            setMessage(
              input
                ? 'Quality Gate saved. White credits are blocked only during its active dates.'
                : 'Quality Gate cancelled.',
            );
          }}
        />
      )}
    </PageTransition>
  );
}
