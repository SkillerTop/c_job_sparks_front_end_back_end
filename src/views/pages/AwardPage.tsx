import { AlertTriangle, Award, CheckCircle2, Send } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { EmptyState } from '@/views/components/common/EmptyState';
import { SelectField } from '@/views/components/ui/SelectField';
import { useSpark } from '@/controllers/SparkContext';
import type { AwardInput, SparkType } from '@/models';
import { selectAwardTargets, selectGpmControlledCoordinators } from '@/models/selectors';
import { focusFirstInvalid } from '@/utils/accessibility';
import { formatDate } from '@/utils/formatters';
import { gpmWhiteAwardQuota, isQualityGateActive } from '@/utils/sparkRules';
import { quarterForDate, todayIso } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';

export function AwardPage() {
  const { snapshot, activeRole, currentUserId, createAward } = useSpark();
  const isRadiantAward = activeRole === 'Top Management';
  const allowedTypes: SparkType[] =
    activeRole === 'Top Management'
      ? ['Radiant']
      : activeRole === 'Head'
        ? ['White', 'Yellow', 'Blue']
        : activeRole === 'GPM'
          ? ['White', 'Yellow']
          : ['Yellow'];
  const [form, setForm] = useState<AwardInput>({
    employeeId: '',
    sparkType: allowedTypes[0],
    category: '',
    description: '',
  });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setForm({ employeeId: '', sparkType: allowedTypes[0], category: '', description: '' });
    setErrors({});
    setMessage(null);
  }, [activeRole]);
  const categories = snapshot!.categories.filter(
    (category) => category.active && category.sparkType === form.sparkType,
  );
  const definition = categories.find((category) => category.name === form.category);
  const amount = isRadiantAward ? 1 : (definition?.amount ?? 0);
  const awardDate = todayIso();
  const ownRequests = snapshot!.awardRequests
    .filter((request) => request.awardedBy === currentUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedEmployee = snapshot!.employees.find((item) => item.id === form.employeeId);
  const eligibleEmployees = selectAwardTargets(snapshot!, currentUserId, activeRole);
  const controlledCoordinatorCount =
    activeRole === 'GPM'
      ? selectGpmControlledCoordinators(snapshot!, currentUserId).length
      : 0;
  const whiteQuota = gpmWhiteAwardQuota(
    controlledCoordinatorCount,
    snapshot!.settings.coordinatorTeamMultiplier,
  );
  const usedWhiteQuota = snapshot!.awardRequests.filter(
    (request) =>
      request.awardedBy === currentUserId &&
      request.sparkType === 'White' &&
      request.status !== 'Rejected' &&
      quarterForDate(request.createdAt) === snapshot!.settings.currentQuarter,
  ).length;
  const directYellow = useMemo(
    () =>
      snapshot!.transactions
        .filter(
          (item) =>
            item.employeeId === form.employeeId &&
            item.sparkType === 'Yellow' &&
            item.quarter === snapshot!.settings.currentQuarter &&
            ['Coordinator Award', 'GPM Award', 'Head of Department Award'].includes(item.source) &&
            item.amount > 0,
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [snapshot, form.employeeId],
  );
  const reservedYellow = useMemo(
    () =>
      snapshot!.awardRequests
        .filter(
          (item) =>
            item.employeeId === form.employeeId &&
            item.sparkType === 'Yellow' &&
            item.status === 'Pending' &&
            quarterForDate(item.createdAt) === snapshot!.settings.currentQuarter,
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [snapshot, form.employeeId],
  );
  const whiteBlocked = Boolean(
    form.employeeId &&
      form.sparkType === 'White' &&
      isQualityGateActive(form.employeeId, snapshot!.qualityGates),
  );
  const update = (field: keyof AwardInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setMessage(null);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.employeeId) next.employeeId = 'Choose an employee.';
    else if (whiteBlocked)
      next.employeeId = 'White awards are blocked by this employee’s active Quality Gate.';
    if (!form.category.trim())
      next.category = isRadiantAward
        ? 'Describe the reason for this Radiant award.'
        : 'Choose a category.';
    if (!form.description.trim()) next.description = 'Describe the achievement.';
    if (Object.keys(next).length) {
      setErrors(next);
      setMessage({ tone: 'error', text: 'Review the highlighted fields.' });
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setSubmitting(true);
    try {
      const status = await createAward(form);
      setMessage({
        tone: 'success',
        text:
          status === 'Pending'
            ? 'Award request sent to the Head for approval.'
            : `${form.sparkType} Spark awarded and recorded in the Ledger.`,
      });
      setForm({ employeeId: '', sparkType: allowedTypes[0], category: '', description: '' });
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not create the award.',
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <PageTransition>
      <PageHeader
        eyebrow={`${activeRole} workspace`}
        title={activeRole === 'Top Management' ? 'Award a Radiant Spark' : 'Award a Spark'}
        description={
          activeRole === 'Coordinator'
            ? 'Yellow awards are available only for colleagues in a shared active project with recorded hours, then submitted to the recipient’s Head.'
            : activeRole === 'GPM'
              ? 'White and Yellow awards are submitted to the recipient’s Head. White allocation is based on the Coordinators and registrars under your control.'
            : 'Direct awards create an immediate, permanent transaction and achievement record.'
        }
      />
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.formLayout}>
        <form className={styles.panel} onSubmit={(event) => void submit(event)} noValidate>
          <div className={styles.formIntro}>
            <span className={`${styles.largeIcon} ${styles[`tone${form.sparkType}`]}`}>
              {form.sparkType === 'Radiant' ? <SparkIcon type="Radiant" size={34} /> : <Award size={22} />}
            </span>
            <div>
              <h2>Award details</h2>
              <p>
                {isRadiantAward
                  ? 'Top Management defines the reason; every Radiant award credits one permanent Spark.'
                  : 'Amounts are controlled by the selected category.'}
              </p>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.formField}>
              <span>
                Employee <b>*</b>
              </span>
              <SelectField
                value={form.employeeId}
                onChange={(value) => update('employeeId', value)}
                options={[
                  { value: '', label: 'Select employee' },
                  ...eligibleEmployees.map((employee) => ({
                    value: employee.id,
                    label: `${employee.name} · ${employee.title}`,
                  })),
                ]}
                ariaLabel="Employee"
                ariaInvalid={Boolean(errors.employeeId)}
                ariaDescribedBy={errors.employeeId ? 'award-employee-error' : undefined}
                required
              />
              {errors.employeeId && (
                <small id="award-employee-error" className={styles.fieldError}>
                  {errors.employeeId}
                </small>
              )}
            </label>
            <label className={styles.formField}>
              <span>Spark type</span>
              <SelectField
                value={form.sparkType}
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    sparkType: value as SparkType,
                    category: '',
                  }));
                  setErrors({});
                  setMessage(null);
                }}
                options={allowedTypes.map((type) => ({ value: type, label: type }))}
                ariaLabel="Spark type"
              />
            </label>
            {isRadiantAward ? (
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>
                  Reason <b>*</b>
                </span>
                <input
                  value={form.category}
                  onChange={(event) => update('category', event.target.value)}
                  placeholder="Name the company-wide impact being recognized…"
                  maxLength={100}
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? 'award-category-error' : undefined}
                  required
                />
                {errors.category && (
                  <small id="award-category-error" className={styles.fieldError}>
                    {errors.category}
                  </small>
                )}
              </label>
            ) : (
              <label className={styles.formField}>
                <span>
                  Category <b>*</b>
                </span>
                <SelectField
                  value={form.category}
                  onChange={(value) => update('category', value)}
                  options={[
                    { value: '', label: 'Select category' },
                    ...categories.map((category) => {
                      const unavailable =
                        form.sparkType === 'Yellow' &&
                        Boolean(form.employeeId) &&
                        directYellow + reservedYellow + category.amount >
                          snapshot!.settings.yellowQuarterlyLimit;
                      return {
                        value: category.name,
                        label: unavailable ? `${category.name} · quarterly limit` : category.name,
                        disabled: unavailable,
                      };
                    }),
                  ]}
                  ariaLabel="Award category"
                  ariaInvalid={Boolean(errors.category)}
                  ariaDescribedBy={errors.category ? 'award-category-error' : undefined}
                  required
                />
                {errors.category && (
                  <small id="award-category-error" className={styles.fieldError}>
                    {errors.category}
                  </small>
                )}
              </label>
            )}
            <div className={styles.formField}>
              <span>Reward</span>
              <div className={styles.rewardPreview}>
                {amount > 0 ? (
                  <SparkBadge type={form.sparkType} amount={amount} />
                ) : (
                  <span>Choose a category</span>
                )}
              </div>
            </div>
            {isRadiantAward && (
              <div className={styles.formField}>
                <span>Award date</span>
                <div className={styles.rewardPreview}>
                  <time dateTime={awardDate}>{formatDate(awardDate)}</time>
                </div>
              </div>
            )}
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>
                Description <b>*</b>
              </span>
              <textarea
                rows={5}
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="Describe the specific contribution and its impact…"
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'award-description-error' : undefined}
                required
              />
              {errors.description && (
                <small id="award-description-error" className={styles.fieldError}>
                  {errors.description}
                </small>
              )}
            </label>
          </div>
          <div className={styles.formFooter}>
            <p>
              <CheckCircle2 size={15} />{' '}
              {isRadiantAward
                ? 'Role and permanence rules apply automatically'
                : 'Role and category rules apply automatically'}
            </p>
            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              {submitting ? <span className={styles.spinner} /> : <Send size={16} />}
              {submitting
                ? 'Creating…'
                : activeRole === 'Coordinator' || activeRole === 'GPM'
                  ? 'Submit request'
                  : 'Award Spark'}
            </button>
          </div>
        </form>
        <aside className={styles.sideStack}>
          <section
            className={`${styles.panel} ${styles.awardTierPreview} ${styles[`tone${form.sparkType}`]}`}
            aria-live="polite"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Live preview</p>
                <h2>{selectedEmployee?.name ?? 'Select an employee'}</h2>
              </div>
              <span className={styles.sparkOrb}>
                <SparkIcon type={form.sparkType} size={form.sparkType === 'Radiant' ? 42 : 22} />
              </span>
            </div>
            <div className={styles.awardPreview}>
              <SparkBadge type={form.sparkType} amount={amount || 1} />
              <strong>
                {form.category ||
                  (isRadiantAward ? 'Radiant award reason' : `${form.sparkType} recognition`)}
              </strong>
              <p>
                {form.description ||
                  'The achievement description will appear here and remain in the employee history.'}
              </p>
            </div>
          </section>
          {form.sparkType === 'Yellow' && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Quarterly safeguard</p>
                  <h2>Direct Yellow limit</h2>
                </div>
                <AlertTriangle size={19} />
              </div>
              <div className={styles.limitLine}>
                <div>
                  <span>Awarded or reserved</span>
                  <strong>
                    {directYellow + reservedYellow} / {snapshot!.settings.yellowQuarterlyLimit}
                  </strong>
                </div>
                <div className={styles.progressTrack}>
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        ((directYellow + reservedYellow) / snapshot!.settings.yellowQuarterlyLimit) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <p className={styles.mutedCopy}>
                Awards that would cross the limit are blocked entirely; amounts are never reduced
                automatically.
              </p>
            </section>
          )}
          {activeRole === 'GPM' && form.sparkType === 'White' && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Quarterly allocation</p>
                  <h2>GPM White awards</h2>
                </div>
                <AlertTriangle size={19} />
              </div>
              <div className={styles.limitLine}>
                <div>
                  <span>Awarded or reserved</span>
                  <strong>
                    {usedWhiteQuota} / {whiteQuota}
                  </strong>
                </div>
                <div className={styles.progressTrack}>
                  <span
                    style={{
                      width: `${Math.min(100, whiteQuota ? (usedWhiteQuota / whiteQuota) * 100 : 100)}%`,
                    }}
                  />
                </div>
              </div>
              <p className={styles.mutedCopy}>
                {controlledCoordinatorCount} active Coordinator or registrar
                {controlledCoordinatorCount === 1 ? '' : 's'} under your control. One White award is
                available for every group of up to {snapshot!.settings.coordinatorTeamMultiplier}.
              </p>
            </section>
          )}
        </aside>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Your submissions</p>
            <h2>Award history</h2>
          </div>
          <span className={styles.subtlePill}>{ownRequests.length} requests</span>
        </div>
        {ownRequests.length ? (
          <div className={styles.tableScroller} tabIndex={0} aria-label="Scrollable award request history">
            <table className={styles.dataTable}>
              <caption className={styles.srOnly}>Awards submitted by the current actor</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee & contribution</th>
                  <th>Reward</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ownRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{formatDate(request.createdAt)}</td>
                    <td>
                      <strong>
                        {snapshot!.employees.find((employee) => employee.id === request.employeeId)?.name}
                      </strong>
                      <span>{request.category}</span>
                      {request.rejectionReason && (
                        <p className={styles.requestReason}>Reason: {request.rejectionReason}</p>
                      )}
                    </td>
                    <td>
                      <SparkBadge type={request.sparkType} amount={request.amount} />
                    </td>
                    <td>
                      <StatusBadge status={request.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Your first award starts here"
            description="Submitted requests and direct awards will appear here with their current status."
          />
        )}
      </section>
    </PageTransition>
  );
}
