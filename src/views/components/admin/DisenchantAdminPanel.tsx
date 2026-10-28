import { CheckCircle2, Coins, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { formatDateTime } from '@/utils/formatters';
import { formatMoney } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';
import { LocalizedText } from '@/views/components/common/LocalizedText';

type StatusFilter = 'All' | 'Created' | 'Exported' | 'Paid' | 'Cancelled';

const exportReference = () => {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `DISENCHANT-${compact}`;
};

const downloadCsv = (fileName: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export function DisenchantAdminPanel() {
  const { localize } = useUserPreferences();
  const { snapshot, mutating, exportDisenchantRequests, markDisenchantPaid } = useSpark();
  const [status, setStatus] = useState<StatusFilter>('All');
  const [departmentId, setDepartmentId] = useState('All');
  const [period, setPeriod] = useState('All');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const periods = [...new Set(snapshot!.disenchantRequests.map((request) => request.accountingPeriod))]
    .sort((left, right) => right.localeCompare(left));
  const filtered = useMemo(() => snapshot!.disenchantRequests
    .filter((request) => status === 'All' || request.status === status)
    .filter((request) => departmentId === 'All' || request.departmentId === departmentId)
    .filter((request) => period === 'All' || request.accountingPeriod === period)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  [snapshot, status, departmentId, period]);
  const exportable = filtered.filter((request) => request.status === 'Created');

  const runExport = async () => {
    if (exportable.length === 0) return;
    setProcessingId('export');
    setMessage(null);
    try {
      const result = await exportDisenchantRequests(exportable.map((request) => request.id), exportReference());
      downloadCsv(result.fileName, result.csv);
      setMessage({
        tone: 'success',
        text: `${exportable.length} request${exportable.length === 1 ? '' : 's'} exported and marked Exported.`,
      });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Export failed.' });
    } finally {
      setProcessingId(null);
    }
  };

  const runPaid = async (requestId: string) => {
    setProcessingId(requestId);
    setMessage(null);
    try {
      await markDisenchantPaid(requestId);
      setMessage({ tone: 'success', text: 'The Disenchant request is marked Paid.' });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Status update failed.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="disenchant-accounting-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}><LocalizedText>Accounting workflow</LocalizedText></p>
          <h2 id="disenchant-accounting-title"><LocalizedText>Disenchant requests</LocalizedText></h2>
          <p className={styles.mutedCopy}><LocalizedText>Filter requests, export a CSV batch and confirm completed payments.</LocalizedText></p>
        </div>
        <Coins size={21} aria-hidden="true" />
      </div>
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.filters}>
        <SelectField
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          options={['All', 'Created', 'Exported', 'Paid', 'Cancelled'].map((value) => ({ value, label: `Status: ${value}` }))}
          ariaLabel="Filter Disenchant requests by status"
          variant="filter"
        />
        <SelectField
          value={departmentId}
          onChange={setDepartmentId}
          options={[
            { value: 'All', label: 'All departments' },
            ...snapshot!.departments.map((department) => ({ value: department.id, label: department.name })),
          ]}
          ariaLabel="Filter Disenchant requests by department"
          variant="filter"
        />
        <SelectField
          value={period}
          onChange={setPeriod}
          options={[{ value: 'All', label: 'All periods' }, ...periods.map((value) => ({ value, label: value }))]}
          ariaLabel="Filter Disenchant requests by accounting period"
          variant="filter"
        />
        <button
          type="button"
          className={styles.primaryButton}
          disabled={mutating || exportable.length === 0}
          onClick={() => void runExport()}
        >
          {processingId === 'export' ? <span className={styles.spinner} /> : <Download size={16} />}
          <LocalizedText>Export created (</LocalizedText>{exportable.length})
        </button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No matching requests" description="Change the accounting filters to see other requests." />
      ) : (
        <div className={styles.tableScroller} tabIndex={0} aria-label={localize('Scrollable Disenchant accounting requests')}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th><LocalizedText>Employee</LocalizedText></th>
                <th><LocalizedText>Department</LocalizedText></th>
                <th><LocalizedText>Sparks</LocalizedText></th>
                <th><LocalizedText>Money value</LocalizedText></th>
                <th><LocalizedText>Period</LocalizedText></th>
                <th><LocalizedText>Created</LocalizedText></th>
                <th><LocalizedText>Status</LocalizedText></th>
                <th><span className={styles.srOnly}><LocalizedText>Actions</LocalizedText></span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request) => (
                <tr key={request.id}>
                  <td>{snapshot!.employees.find((employee) => employee.id === request.employeeId)?.name ?? request.employeeId}</td>
                  <td>{snapshot!.departments.find((department) => department.id === request.departmentId)?.name ?? request.departmentId}</td>
                  <td>{request.amount} {request.sparkType}</td>
                  <td>{formatMoney(request.moneyValue, request.currency)}</td>
                  <td>{request.accountingPeriod}</td>
                  <td>{formatDateTime(request.createdAt)}</td>
                  <td><StatusBadge status={request.status} /></td>
                  <td>
                    {request.status === 'Exported' && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={mutating || processingId === request.id}
                        onClick={() => void runPaid(request.id)}
                      >
                        {processingId === request.id ? <span className={styles.spinner} /> : <CheckCircle2 size={15} />}
                        <LocalizedText>Mark Paid
                      </LocalizedText></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
