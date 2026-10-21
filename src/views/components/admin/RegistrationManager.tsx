import { CheckCircle2, Clock3, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';
import { ALL_ROLES } from '@/constants/app';
import type { Employee } from '@/models';
import type { AccessApprovalEmployeeInput, AuthAccount, AuthAuditEvent } from '@/models/auth';
import { formatDateTime } from '@/utils/formatters';
import { useAppMode } from '@/controllers/useAppMode';
import { SelectField } from '@/views/components/ui/SelectField';
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
  const { isApiMode } = useAppMode();
  const { accounts, auditEvents, reviewRegistration } = useAuth();
  const { snapshot, refresh } = useSpark();
  const [selected, setSelected] = useState<AuthAccount | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>('Approved');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [employeeProfile, setEmployeeProfile] = useState<AccessApprovalEmployeeInput | null>(null);
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
    return snapshot!.departments.find((department) =>
      department.id === (employee?.departmentId ?? account.requestedDepartmentId));
  };

  const openReview = (account: AuthAccount, nextDecision: ReviewDecision) => {
    const employee = employeeFor(account);
    const suggestedName = [account.firstName, account.lastName].filter(Boolean).join(' ').trim();
    setSelected(account);
    setDecision(nextDecision);
    setReason('');
    setEmployeeProfile({
      name: employee?.name ?? suggestedName,
      title: employee?.title?.trim() || account.suggestedJobTitle || '',
      departmentId: employee?.departmentId ?? account.requestedDepartmentId ??
        snapshot!.departments.find((department) => department.active)?.id ?? '',
      role: employee?.role ?? account.suggestedRole ?? 'Employee',
      managerId: employee?.managerId ?? account.suggestedManagerId ?? '',
    });
    setMessage(null);
    setReviewError('');
  };

  const submitReview = async () => {
    if (!selected || processing) return;
    setProcessing(true);
    setMessage(null);
    try {
      if (decision === 'Approved' && (!employeeProfile?.name.trim() || !employeeProfile.title.trim() || !employeeProfile.departmentId)) {
        setReviewError('Complete the employee name, job title and department before approval.');
        return;
      }
      await reviewRegistration(selected.id, decision, reason,
        decision === 'Approved' && employeeProfile
          ? { ...employeeProfile, managerId: employeeProfile.managerId || undefined }
          : undefined);
      await refresh();
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
            <p>Review the work email, then create or update the employee directory profile before granting access.</p>
          </div>
          <span className={accessStyles.pendingCounter}>
            <Clock3 size={16} /> {pending.length} pending
          </span>
        </div>
        {!isApiMode && (
          <div className={accessStyles.demoDisclosure} role="note">
            This frontend demo does not verify email ownership. Requests and decisions stay in this browser and are not shared with other devices.
          </div>
        )}

        {pending.length === 0 ? (
          <EmptyState
            title="No registrations waiting"
            description="New work-account requests will appear here even when the employee is not in the directory yet."
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
                        <h3>{employee?.name ?? ([account.firstName, account.lastName].filter(Boolean).join(' ') || 'New employee')}</h3>
                        <StatusBadge status={account.status} />
                      </div>
                      <p>{account.email}</p>
                      <dl className={accessStyles.registrationMeta}>
                        <div><dt>Profile</dt><dd>{employee ? 'Linked directory employee' : 'Create on approval'}</dd></div>
                        <div><dt>Provider</dt><dd>{account.authProvider === 'entra' ? 'Microsoft' : 'Email and password'}</dd></div>
                        <div><dt>Role</dt><dd>{employee?.role ?? account.suggestedRole ?? 'Choose during approval'}</dd></div>
                        <div><dt>Department</dt><dd>{department?.name ?? account.suggestedDepartmentName ?? 'Choose during approval'}</dd></div>
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
                        onClick={() => openReview(account, 'Approved')}
                      >
                        <CheckCircle2 size={16} /> Approve
                      </button>
                    </div>
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
              ? `Complete the directory profile for ${selected.email}. The employee is created or updated only when you approve.`
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
          <div className={accessStyles.approvalProfile}>
            <div className={accessStyles.reviewSummary}>
              <ShieldCheck size={19} />
              <p>Approval and directory creation are saved together. If either step fails, no access is granted.</p>
            </div>
            <div className={styles.fieldGrid}>
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>Work email</span>
                <input value={selected?.email ?? ''} readOnly aria-readonly="true" />
                <small>The sign-in email is fixed to the verified request.</small>
              </label>
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>Employee name <b>*</b></span>
                <input
                  value={employeeProfile?.name ?? ''}
                  disabled={processing}
                  maxLength={200}
                  onChange={(event) => setEmployeeProfile((current) => current ? { ...current, name: event.target.value } : current)}
                />
              </label>
              <label className={styles.formField}>
                <span>Job title <b>*</b></span>
                <input
                  value={employeeProfile?.title ?? ''}
                  disabled={processing}
                  maxLength={200}
                  onChange={(event) => setEmployeeProfile((current) => current ? { ...current, title: event.target.value } : current)}
                />
                {selected?.suggestedJobTitle && (
                  <small>Pre-filled from Microsoft: {selected.suggestedJobTitle}</small>
                )}
              </label>
              <label className={styles.formField}>
                <span>Department <b>*</b></span>
                <SelectField
                  value={employeeProfile?.departmentId ?? ''}
                  disabled={processing}
                  onChange={(value) => setEmployeeProfile((current) => current ? { ...current, departmentId: value } : current)}
                  options={[
                    { value: '', label: 'Choose department' },
                    ...snapshot!.departments.filter((department) => department.active)
                      .map((department) => ({ value: department.id, label: department.name })),
                  ]}
                  ariaLabel="Employee department"
                  required
                />
                {selected?.suggestedDepartmentName && (
                  <small>Microsoft department: {selected.suggestedDepartmentName}</small>
                )}
              </label>
              <label className={styles.formField}>
                <span>Business role <b>*</b></span>
                <SelectField
                  value={employeeProfile?.role ?? 'Employee'}
                  disabled={processing}
                  onChange={(value) => setEmployeeProfile((current) => current
                    ? { ...current, role: value as Employee['role'] } : current)}
                  options={ALL_ROLES.map((role) => ({ value: role, label: role }))}
                  ariaLabel="Employee business role"
                />
                {selected?.suggestedRole && (
                  <small>Pre-filled from Microsoft app role: {selected.suggestedRole}</small>
                )}
              </label>
              <label className={styles.formField}>
                <span>Reports to</span>
                <SelectField
                  value={employeeProfile?.managerId ?? ''}
                  disabled={processing}
                  onChange={(value) => setEmployeeProfile((current) => current ? { ...current, managerId: value } : current)}
                  options={[
                    { value: '', label: 'Not assigned' },
                    ...snapshot!.employees.filter((employee) => employee.active && employee.id !== selected?.employeeId)
                      .map((employee) => ({ value: employee.id, label: employee.name })),
                  ]}
                  ariaLabel="Employee manager"
                />
                {(selected?.suggestedManagerName || selected?.suggestedManagerEmail) && (
                  <small>
                    Microsoft manager: {selected.suggestedManagerName ?? selected.suggestedManagerEmail}
                    {selected.suggestedManagerName && selected.suggestedManagerEmail
                      ? ` (${selected.suggestedManagerEmail})` : ''}
                    {!selected.suggestedManagerId ? ' — not found in Directory' : ''}
                  </small>
                )}
              </label>
            </div>
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
            disabled={processing || (decision === 'Rejected' && reason.trim().length < 5) ||
              (decision === 'Approved' && (!employeeProfile?.name.trim() || !employeeProfile.title.trim() || !employeeProfile.departmentId))}
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
