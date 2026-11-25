import { ChevronDown, Layers3, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { AppSnapshot } from '@/models';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import styles from '@/views/styles/app.module.css';

interface DepartmentMembershipPickerProps {
  departments: AppSnapshot['departments'];
  primaryDepartmentId: string;
  selectedDepartmentIds: readonly string[];
  onChange: (departmentIds: string[]) => void;
  disabled?: boolean;
  helpText?: string;
}

export function DepartmentMembershipPicker({
  departments,
  primaryDepartmentId,
  selectedDepartmentIds,
  onChange,
  disabled = false,
  helpText = 'Choose every department this employee belongs to. The primary department remains selected above.',
}: DepartmentMembershipPickerProps) {
  const { localize } = useUserPreferences();
  const [query, setQuery] = useState('');
  const selectedIds = useMemo(
    () => [...new Set([primaryDepartmentId, ...selectedDepartmentIds].filter(Boolean))],
    [primaryDepartmentId, selectedDepartmentIds],
  );
  const selected = departments.filter((department) => selectedIds.includes(department.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = departments.filter(
    (department) => !normalizedQuery || department.name.toLocaleLowerCase().includes(normalizedQuery),
  );
  const preview = selected.slice(0, 2);
  const hiddenCount = Math.max(0, selected.length - preview.length);

  const toggle = (departmentId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedIds, departmentId])]
      : selectedIds.filter((id) => id !== departmentId && id !== primaryDepartmentId);
    onChange(next);
  };

  return (
    <fieldset className={`${styles.formField} ${styles.fieldFull}`}>
      <legend><LocalizedText>Department memberships</LocalizedText></legend>
      <small><LocalizedText>{helpText}</LocalizedText></small>
      <details className={styles.membershipPicker}>
        <summary className={styles.membershipSummary}>
          <span className={styles.membershipSummaryIcon} aria-hidden="true"><Layers3 size={17} /></span>
          <span className={styles.membershipPreview}>
            {preview.map((department) => (
              <span className={styles.membershipChip} key={department.id}>{department.name}</span>
            ))}
            {hiddenCount > 0 ? <span className={styles.membershipMore}>+{hiddenCount}</span> : null}
            {selected.length === 0 ? <span className={styles.membershipPlaceholder}><LocalizedText>Choose departments</LocalizedText></span> : null}
          </span>
          <span className={styles.membershipCount}>{selected.length} {localize('selected')}</span>
          <ChevronDown className={styles.membershipChevron} size={16} aria-hidden="true" />
        </summary>
        <div className={styles.membershipPanel}>
          <label className={styles.membershipSearch}>
            <span className={styles.srOnly}><LocalizedText>Search departments</LocalizedText></span>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              disabled={disabled}
              placeholder={localize('Search departments')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.membershipOptions}>
            {visible.map((department) => {
              const primary = department.id === primaryDepartmentId;
              const checked = selectedIds.includes(department.id);
              return (
                <label className={styles.membershipOption} key={department.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || primary}
                    onChange={(event) => toggle(department.id, event.target.checked)}
                  />
                  <span>{department.name}</span>
                  {primary ? <span className={styles.membershipPrimary}><LocalizedText>Primary</LocalizedText></span> : null}
                </label>
              );
            })}
            {visible.length === 0 ? (
              <p className={styles.membershipEmpty}><LocalizedText>No departments found</LocalizedText></p>
            ) : null}
          </div>
        </div>
      </details>
    </fieldset>
  );
}
