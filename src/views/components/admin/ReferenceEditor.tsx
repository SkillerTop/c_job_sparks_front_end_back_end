import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { ALL_ROLES } from '@/constants/app';
import { Modal } from '@/views/components/common/Modal';
import { Feedback } from '@/views/components/common/Feedback';
import { SelectField } from '@/views/components/ui/SelectField';
import { useAuth } from '@/controllers/AuthContext';
import type { AppSnapshot, Department, Employee, ReferenceDraft, SparkCategory } from '@/models';
import styles from '@/views/styles/app.module.css';

type ReferenceFields = Employee & Department & SparkCategory;

export function ReferenceEditor({
  initialDraft,
  snapshot,
  onSave,
  onClose,
}: {
  initialDraft: ReferenceDraft;
  snapshot: AppSnapshot;
  onSave: (draft: ReferenceDraft) => Promise<void>;
  onClose: () => void;
}) {
  const { accounts } = useAuth();
  const [draft, setDraft] = useState(() => structuredClone(initialDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const emailLocked =
    draft.kind === 'employees' &&
    Boolean(draft.data.id) &&
    accounts.some((account) => account.employeeId === draft.data.id);
  const update = <K extends keyof ReferenceFields>(field: K, value: ReferenceFields[K]) => {
    setDraft((current) => ({ ...current, data: { ...current.data, [field]: value } }) as ReferenceDraft);
    setError('');
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={`${draft.data.id ? 'Edit' : 'Add'} ${draft.kind === 'categories' ? 'category' : draft.kind.slice(0, -1)}`}
      description="Changes apply to future operations. Existing Ledger and audit records are preserved."
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={(event) => void save(event)}>
        {error && <Feedback tone="error">{error}</Feedback>}
        <div className={styles.fieldGrid}>
          <label className={`${styles.formField} ${styles.fieldFull}`}>
            <span>
              Name <b>*</b>
            </span>
            <input
              value={draft.data.name}
              onChange={(event) => update('name', event.target.value)}
              required
              maxLength={100}
              autoComplete="off"
            />
          </label>
          {draft.kind === 'employees' && (
            <>
              <label className={styles.formField}>
                <span>
                  Job title <b>*</b>
                </span>
                <input
                  value={draft.data.title}
                  onChange={(event) => update('title', event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label className={styles.formField}>
                <span>
                  Email <b>*</b>
                </span>
                <input
                  type="email"
                  value={draft.data.email}
                  onChange={(event) => update('email', event.target.value)}
                  required
                  readOnly={emailLocked}
                  aria-describedby={emailLocked ? 'employee-email-lock-note' : undefined}
                  autoComplete="off"
                />
                {emailLocked && (
                  <small id="employee-email-lock-note">
                    Locked because this employee has a local access account. Identity changes require a real account recovery flow.
                  </small>
                )}
              </label>
              <label className={styles.formField}>
                <span>
                  Department <b>*</b>
                </span>
                <SelectField
                  value={draft.data.departmentId}
                  onChange={(value) => update('departmentId', value)}
                  options={[
                    { value: '', label: 'Choose department' },
                    ...snapshot.departments.map((department) => ({
                      value: department.id,
                      label: `${department.name}${!department.active ? ' · inactive' : ''}`,
                    })),
                  ]}
                  ariaLabel="Department"
                  required
                />
              </label>
              <label className={styles.formField}>
                <span>Business role</span>
                <SelectField
                  value={draft.data.role}
                  onChange={(value) => update('role', value as Employee['role'])}
                  options={ALL_ROLES.map((role) => ({ value: role, label: role }))}
                  ariaLabel="Business role"
                />
              </label>
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>Reports to</span>
                <SelectField
                  value={draft.data.managerId ?? ''}
                  onChange={(value) => update('managerId', value)}
                  options={[
                    { value: '', label: 'Not assigned' },
                    ...snapshot.employees
                      .filter((employee) => employee.active && employee.id !== draft.data.id)
                      .map((employee) => ({ value: employee.id, label: employee.name })),
                  ]}
                  ariaLabel="Reports to"
                />
              </label>
              <label className={`${styles.checkField} ${styles.fieldFull}`}>
                <input
                  type="checkbox"
                  checked={draft.data.hasCoordinationExperience}
                  onChange={(event) => update('hasCoordinationExperience', event.target.checked)}
                />
                <span>Has previous coordination experience</span>
              </label>
            </>
          )}
          {draft.kind === 'departments' && (
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>Department head</span>
              <SelectField
                value={draft.data.headId}
                onChange={(value) => update('headId', value)}
                options={[
                  { value: '', label: 'Not assigned yet' },
                  ...snapshot.employees
                    .filter(
                      (employee) =>
                        employee.role === 'Head' &&
                        employee.active &&
                        employee.departmentId === draft.data.id,
                    )
                    .map((employee) => ({ value: employee.id, label: employee.name })),
                ]}
                ariaLabel="Department head"
              />
              <small>Create the department, assign a Head employee to it, then select them here.</small>
            </label>
          )}
          {draft.kind === 'categories' && (
            <>
              <label className={styles.formField}>
                <span>Spark type</span>
                <SelectField
                  value={draft.data.sparkType}
                  disabled={Boolean(draft.data.id)}
                  onChange={(value) => {
                    const sparkType = value as SparkCategory['sparkType'];
                    setDraft(
                      (current) =>
                        ({
                          ...current,
                          data: {
                            ...current.data,
                            sparkType,
                            amount: 1,
                            period:
                              sparkType === 'Blue'
                                ? 'Yearly'
                                : sparkType === 'Yellow'
                                  ? 'Quarterly'
                                  : 'Unrestricted',
                          },
                        }) as ReferenceDraft,
                    );
                  }}
                  options={(['White', 'Yellow', 'Blue'] as SparkCategory['sparkType'][]).map((type) => ({
                    value: type,
                    label: type,
                  }))}
                  ariaLabel="Spark type"
                />
              </label>
              <label className={styles.formField}>
                <span>Sparks awarded</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  max={100}
                  required
                  value={draft.data.amount}
                  onChange={(event) => update('amount', Number(event.target.value))}
                />
                <small>White, Yellow and Blue amounts apply to future Award a Spark operations. Peer Recognition remains 1 White.</small>
              </label>
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>Category limit period</span>
                <SelectField
                  value={draft.data.period}
                  disabled={draft.data.sparkType !== 'Blue' || draft.data.id === 'blue-0'}
                  onChange={(value) => update('period', value as SparkCategory['period'])}
                  options={(draft.data.sparkType === 'Blue'
                    ? ['Quarterly', 'Yearly', 'One-time']
                    : [draft.data.period]
                  ).map((period) => ({ value: period, label: period }))}
                  ariaLabel="Category limit period"
                />
                <small>Employee of the Year always uses the annual department quota.</small>
              </label>
              <label className={`${styles.formField} ${styles.fieldFull}`}>
                <span>Description</span>
                <textarea
                  rows={3}
                  value={draft.data.description}
                  onChange={(event) => update('description', event.target.value)}
                  maxLength={500}
                />
              </label>
            </>
          )}
          <label className={`${styles.checkField} ${styles.fieldFull}`}>
            <input
              type="checkbox"
              checked={draft.data.active}
              onChange={(event) => update('active', event.target.checked)}
            />
            <span>
              Active record<small>Inactive records stay in historical references.</small>
            </span>
          </label>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? <span className={styles.spinner} /> : <Save size={16} />}
            {saving ? 'Saving…' : 'Save record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
