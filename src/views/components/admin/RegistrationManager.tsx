import { CheckCircle2, Clock3, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';
import type { AuthAccount, AuthAuditEvent } from '@/models/auth';
import { formatDateTime } from '@/utils/formatters';
import styles from '@/views/styles/app.module.css';
import accessStyles from '@/views/styles/access.module.css';

type ReviewDecision = 'Approved' | 'Rejected';
const historyLabels: Record<AuthAuditEvent['action'], string> = {
  REGISTRATION_SUBMITTED: 'Registration submitted',
  REGISTRATION_RESUBMITTED: 'Registration resubmitted',
  REGISTRATION_APPROVED: 'Registration approved',
  REGISTRATION_REJECTED: 'Registration rejected',
  PASSWORD_CHANGED: 'Password changed',
};

export function RegistrationManager() {
  const { accounts, auditEvents, reviewRegistration } = useAuth();
  const { snapshot } = useSpark();
  const [selected, setSelected] = useState<AuthAccount | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>('Approved');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const registrations = useMemo(
    () => accounts.filter((account) => account.source === 'Registration'),
    [accounts],
  );
  const pending = registrations
    .filter((account) => account.status === 'Pending')
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const history = [...auditEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const employeeFor = (account: AuthAccount) =>
    snapshot!.employees.find((employee) => employee.id === account.employeeId);
  const departmentFor = (account: AuthAccount) => {
    const employee = employeeFor(account);
    return snapshot!.departments.find((department) => department.id === employee?.departmentId);
  };

  const openReview = (account: AuthAccount, nextDecision: ReviewDecision) => {
    setSelected(account);
    setDecision(nextDecision);
    setReason('');
    setMessage(null);
    setReviewError('');
  };

  const submitReview = async () => {
    if (!selected || processing) return;
    setProcessing(true);
    setMessage(null);
    try {
      await reviewRegistration(selected.id, decision, reason);
      setSelected(null);
      setReason('');
      setMessage(decision === 'Approved' ? `${selected.email} can now sign in.` : `${selected.email} was rejected.`);
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : 'Could not review this request.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className={accessStyles.accessStack}>
      {message && <Feedback tone="success">{message}</Feedback>}
      <section className={styles.panel} aria-labelledby="registration-queue-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Account access</p>
            <h2 id="registration-queue-title">Registration approvals</h2>
            <p>Confirm that each email belongs to the linked employee before granting access.</p>
          </div>
          <span className={accessStyles.pendingCounter}>
            <Clock3 size={16} /> {pending.length} pending
          </span>
        </div>
        <div className={accessStyles.demoDisclosure} role="note">
          This frontend demo does not verify email ownership. Requests and decisions stay in this browser and are not shared with other devices.
        </div>

        {pending.length === 0 ? (
          <EmptyState
            title="No registrations waiting"
            description="New requests from employee-directory emails will appear here."
          />
        ) : (
          <div className={accessStyles.registrationList}>
            {pending.map((account) => {
              const employee = employeeFor(account);
              const department = departmentFor(account);
              return (
                <article className={accessStyles.registrationCard} key={account.id}>
                  <div className={accessStyles.registrationIdentity}>
                    <span className={styles.avatar}>{employee?.initials ?? '?'}</span>
                    <div>
                      <div className={accessStyles.registrationTitle}>
                        <h3>{employee?.name ?? 'Directory profile unavailable'}</h3>
                        <StatusBadge status={account.status} />
                      </div>
                      <p>{account.email}</p>
                      <dl className={accessStyles.registrationMeta}>
                        <div><dt>Role</dt><dd>{employee?.role ?? 'Unavailable'}</dd></div>
                        <div><dt>Department</dt><dd>{department?.name ?? 'Unavailable'}</dd></div>
                        <div><dt>Requested</dt><dd>{formatDateTime(account.requestedAt)}</dd></div>
                      </dl>
                    </div>
                  </div>
                  <div className={accessStyles.registrationActionGroup}>
                    <div className={accessStyles.registrationActions}>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => openReview(account, 'Rejected')}
                      >
                        <XCircle size={16} /> Reject
                      </button>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        disabled={!employee?.active}
                        aria-describedby={!employee?.active ? `approval-block-${account.id}` : undefined}
                        onClick={() => openReview(account, 'Approved')}
                      >
                        <CheckCircle2 size={16} /> Approve
                      </button>
                    </div>
                    {!employee?.active && (
                      <small className={accessStyles.approvalBlocked} id={`approval-block-${account.id}`}>
                        Approval is blocked because the employee is inactive or unavailable. Reject the request to clear the queue.
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="access-history-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Recent decisions</p>
            <h2 id="access-history-title">Access history</h2>
          </div>
          <UserCheck size={20} />
        </div>
        {history.length === 0 ? (
          <p className={styles.mutedCopy}>Submitted, approved, rejected and resubmitted requests will remain visible here.</p>
        ) : (
          <div className={accessStyles.historyList}>
            {history.slice(0, 10).map((event) => {
              const account = accounts.find((item) => item.id === event.accountId);
              const employee = account ? employeeFor(account) : undefined;
              const status = event.action === 'REGISTRATION_APPROVED'
                ? 'Approved'
                : event.action === 'REGISTRATION_REJECTED'
                  ? 'Rejected'
                  : 'Pending';
              const actor = snapshot!.employees.find((item) => item.id === event.actorId);
              return (
                <article key={event.id}>
                  <span className={accessStyles.historyIcon} data-status={status}>
                    {status === 'Approved' ? (
                      <CheckCircle2 size={17} />
                    ) : status === 'Rejected' ? (
                      <XCircle size={17} />
                    ) : (
                      <Clock3 size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{historyLabels[event.action]}</strong>
                    <p>{event.details}</p>
                    <small>{employee?.name ?? account?.email ?? 'Account no longer available'} · actor {actor?.name ?? event.actorId}</small>
                  </div>
                  <div className={accessStyles.historyStatus}>
                    <StatusBadge status={status} />
                    <small>{formatDateTime(event.createdAt)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(selected)}
        title={decision === 'Approved' ? 'Approve this registration?' : 'Reject this registration?'}
        description={
          selected
            ? decision === 'Approved'
              ? `${selected.email} will be able to sign in with the role from the employee directory.`
              : `Add a clear note for ${selected.email}. They can resubmit with their original password later.`
            : ''
        }
        onClose={() => {
          if (processing) return;
          setSelected(null);
          setReviewError('');
        }}
      >
        {reviewError && <Feedback tone="error">{reviewError}</Feedback>}
        {decision === 'Approved' ? (
          <div className={accessStyles.reviewSummary}>
            <ShieldCheck size={19} />
            <p>Approval grants workspace access but does not change the employee's assigned role.</p>
          </div>
        ) : (
          <label className={styles.formField}>
            <span>Reason for rejection</span>
            <textarea
              value={reason}
              disabled={processing}
              maxLength={240}
              rows={4}
              aria-describedby="rejection-reason-help"
              aria-invalid={reason.length > 0 && reason.trim().length < 5}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain what the employee should correct…"
              required
            />
            <small id="rejection-reason-help" aria-live="polite">
              {reason.trim().length}/240 · minimum 5 characters required to enable rejection
            </small>
          </label>
        )}
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={processing}
            onClick={() => {
              setSelected(null);
              setReviewError('');
            }}
          >
            Cancel
          </button>
          <button
            className={decision === 'Approved' ? styles.primaryButton : styles.rejectButton}
            type="button"
            disabled={processing || (decision === 'Rejected' && reason.trim().length < 5)}
            onClick={() => void submitReview()}
          >
            {processing ? <span className={styles.spinner} /> : decision === 'Approved' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {processing ? 'Saving…' : decision === 'Approved' ? 'Approve access' : 'Reject request'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
