import { useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { useSpark } from '@/controllers/SparkContext';
import { Feedback } from '@/views/components/common/Feedback';
import { EmptyState } from '@/views/components/common/EmptyState';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { ReferenceEditor } from './ReferenceEditor';
import type { Department, Employee, ReferenceDraft, SparkCategory } from '@/models';
import { createReferenceDraft } from '@/utils/referenceDraft';
import styles from '@/views/styles/app.module.css';
import { useAppMode } from '@/controllers/useAppMode';import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { LocalizedText } from '@/views/components/common/LocalizedText';


type VisibleReferenceKind = ReferenceDraft['kind'];
type VisibleReferenceRow = Employee | Department | SparkCategory;

const labels: Record<VisibleReferenceKind, string> = {
  employees: 'Employees',
  departments: 'Departments',
  categories: 'Categories',
};

export function ReferenceManager() {
  const { localize } = useUserPreferences();
  const { isApiMode } = useAppMode();
  const { snapshot, saveReference, deleteEmployee } = useSpark();
  const [kind, setKind] = useState<VisibleReferenceKind>('employees');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ReferenceDraft | null>(null);
  const [message, setMessage] = useState('');
  const rows = (snapshot![kind] as VisibleReferenceRow[]).filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const save = async (next: ReferenceDraft) => {
    await saveReference(next);
    setMessage(`${next.data.name} saved. Future forms now use the updated reference data.`);
  };
  return (
    <section className={styles.panel}>
      <div className={`${styles.panelHeader} ${styles.panelHeaderStack}`}>
        <div>
          <p className={styles.eyebrow}><LocalizedText>Reference directory</LocalizedText></p>
          <h2><LocalizedText>{labels[kind]}</LocalizedText></h2>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setMessage('');
            setDraft(createReferenceDraft(kind, snapshot!));
          }}
        >
          <Plus size={16} /> <LocalizedText>Add record
        </LocalizedText></button>
      </div>
      {message && <Feedback tone="success">{message}</Feedback>}
      <div className={styles.filterBar}>
        <div className={styles.segmented} role="group" aria-label={localize('Reference type')}>
          {(Object.keys(labels) as VisibleReferenceKind[]).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={item === kind}
              className={item === kind ? styles.segmentActive : ''}
              onClick={() => {
                setKind(item);
                setQuery('');
                setMessage('');
              }}
            >
              {labels[item]}
            </button>
          ))}
        </div>
        <label className={styles.searchField}>
          <Search size={16} />
          <span className={styles.srOnly}><LocalizedText>Search </LocalizedText>{labels[kind].toLowerCase()}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${labels[kind].toLowerCase()}…`}
          />
        </label>
      </div>
      {rows.length ? (
        <div className={styles.tableScroller} tabIndex={0} aria-label={localize('Scrollable reference directory')}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>{labels[kind]} <LocalizedText>reference records</LocalizedText></caption>
            <thead>
              <tr>
                <th><LocalizedText>Name</LocalizedText></th>
                <th><LocalizedText>Details</LocalizedText></th>
                <th><LocalizedText>Configuration</LocalizedText></th>
                <th><LocalizedText>Status</LocalizedText></th>
                <th>
                  <span className={styles.srOnly}><LocalizedText>Actions</LocalizedText></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.tableIdentity}>
                      <strong>{item.name}</strong>
                      <small>{'email' in item ? item.email : item.id}</small>
                    </div>
                  </td>
                  <td>
                    <LocalizedText>{'role' in item ? (
                      item.role
                    ) : 'sparkType' in item ? (
                      <SparkBadge type={item.sparkType} amount={item.amount} />
                    ) : (
                      (snapshot!.employees.find((employee) => employee.id === item.headId)?.name ??
                      'Head not assigned')
                    )}</LocalizedText>
                  </td>
                  <td>
                    <LocalizedText>{'departmentId' in item
                      ? snapshot!.departments.find((department) => department.id === item.departmentId)?.name
                      : 'period' in item
                        ? `${item.usageType === 'PeerRecognition' ? 'Peer Recognition' : item.usageType} · ${item.period}`
                        : 'Department-scoped approvals'}</LocalizedText>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${item.active ? styles.statusApproved : styles.statusCancelled}`}
                    >
                      <LocalizedText>{item.active ? 'Active' : 'Inactive'}</LocalizedText>
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Edit ${item.name}`}
                      onClick={() => {
                        setMessage('');
                        setDraft({ kind, data: structuredClone(item) } as ReferenceDraft);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No matching records"
          description="Try another name or create a new reference record."
        />
      )}
      <p className={styles.mutedCopy}>
        <LocalizedText>{kind === 'employees'
          ? 'Employees can be deleted from Directory. Their access is disabled, while immutable Ledger and audit history remains preserved.'
          : isApiMode
          ? 'Records are deactivated, never deleted, so historical references remain intact.'
          : 'Records are deactivated, never deleted. The six demo identities keep their roles and active status so every workspace remains accessible.'}</LocalizedText>
      </p>
      {draft && (
        <ReferenceEditor
          initialDraft={draft}
          snapshot={snapshot!}
          onSave={save}
          onDelete={draft.kind === 'employees' && Boolean(draft.data.id)
            ? async () => {
                await deleteEmployee(draft.data.id);
                setMessage(`${draft.data.name} was deleted from Employee Directory.`);
              }
            : undefined}
          onClose={() => setDraft(null)}
        />
      )}
    </section>
  );
}
