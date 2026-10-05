import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Store,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { ReferenceManager } from '@/views/components/admin/ReferenceManager';
import { EconomySettings } from '@/views/components/admin/EconomySettings';
import { CategoryAwardSettings } from '@/views/components/admin/CategoryAwardSettings';
import { RegistrationManager } from '@/views/components/admin/RegistrationManager';
import { ShopAdminPanel } from '@/views/components/admin/ShopAdminPanel';
import { useSpark } from '@/controllers/SparkContext';
import type { ImportPreview } from '@/models';
import { formatDateTime } from '@/utils/formatters';
import { quarterForDate } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';

type Tab = 'Access' | 'Shop' | 'Import' | 'Directory' | 'Rules' | 'Audit';
const ADMIN_TABS: Tab[] = ['Access', 'Shop', 'Import', 'Directory', 'Rules', 'Audit'];

export function AdminPage() {
  const { snapshot, currentUserId, mutating, previewImport, confirmImport, resetDemo } = useSpark();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTab = new URLSearchParams(location.search).get('tab')?.toLowerCase();
  const tab = ADMIN_TABS.find((item) => item.toLowerCase() === requestedTab) ?? 'Access';
  const [kind, setKind] = useState<'KPI' | 'Evaluation'>('KPI');
  const [quarter, setQuarter] = useState(snapshot!.settings.currentQuarter);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [validating, setValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const kindLabel = kind === 'Evaluation' ? 'Personal cards reward' : 'KPI';
  const quarterOptions = Array.from({ length: 8 }, (_, index) => {
    const date = new Date();
    return quarterForDate(
      new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 - index * 3, 1)),
    );
  });
  useEffect(() => {
    setPreview(null);
    setMessage(null);
  }, [kind, quarter]);
  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setMessage({ tone: 'error', text: 'Choose a CSV file.' });
      return;
    }
    setValidating(true);
    setPreview(null);
    setMessage({ tone: 'info', text: 'Validating users, values, Quality Gates and duplicate keys…' });
    try {
      setPreview(await previewImport(kind, quarter, file));
      setMessage(null);
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not validate this file.',
      });
    } finally {
      setValidating(false);
    }
  };
  const runImport = async (replace: boolean) => {
    if (!preview) return;
    setProcessing(true);
    setMessage(null);
    try {
      await confirmImport(preview, replace);
      setMessage({
        tone: 'success',
        text: replace
          ? 'Existing quarter data replaced without duplicate credits.'
          : 'Import confirmed and transactions created.',
      });
      setPreview(null);
      setReplaceOpen(false);
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Import failed.' });
      setReplaceOpen(false);
    } finally {
      setProcessing(false);
    }
  };
  const runReset = async () => {
    try {
      if (!(await resetDemo())) return;
      setResetKey((value) => value + 1);
      setPreview(null);
      setResetOpen(false);
      setMessage({ tone: 'success', text: 'Demo data restored.' });
    } catch (caught) {
      setResetOpen(false);
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not reset demo data.',
      });
    }
  };
  return (
    <PageTransition>
      <PageHeader
        eyebrow="System administration"
        title="Admin Settings"
        description="Review account access, manage the reward shop, validate imports and configure Spark rules. Administrative access does not grant award permissions."
        action={
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={mutating || validating}
            onClick={() => setResetOpen(true)}
          >
            <RefreshCcw size={15} /> Reset demo
          </button>
        }
      />
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.adminTabs} role="group" aria-label="Admin sections">
        {ADMIN_TABS.map((item) => (
          <button
            type="button"
            aria-pressed={tab === item}
            className={tab === item ? styles.adminTabActive : ''}
            key={item}
            onClick={() =>
              navigate(
                { pathname: location.pathname, search: `?tab=${item.toLowerCase()}` },
                { replace: true },
              )
            }
          >
            {item === 'Access' ? (
              <UserCheck size={16} />
            ) : item === 'Shop' ? (
              <Store size={16} />
            ) : item === 'Import' ? (
              <Upload size={16} />
            ) : item === 'Directory' ? (
              <Users size={16} />
            ) : item === 'Rules' ? (
              <Settings2 size={16} />
            ) : (
              <History size={16} />
            )}
            {item}
          </button>
        ))}
      </div>

      {tab === 'Access' && <RegistrationManager />}

      {tab === 'Shop' && <ShopAdminPanel />}

      {tab === 'Import' && (
        <div className={styles.adminGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>CSV data import</p>
                <h2>Prepare a validated batch</h2>
              </div>
              <FileSpreadsheet size={21} />
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.formField}>
                <span>Data source</span>
                <SelectField
                  value={kind}
                  disabled={validating || processing}
                  onChange={(value) => setKind(value as 'KPI' | 'Evaluation')}
                  options={[
                    { value: 'KPI' as const, label: 'KPI' },
                    { value: 'Evaluation' as const, label: 'Personal cards reward' },
                  ]}
                  ariaLabel="Data source"
                />
              </label>
              <label className={styles.formField}>
                <span>Quarter</span>
                <SelectField
                  value={quarter}
                  disabled={validating || processing}
                  onChange={setQuarter}
                  options={quarterOptions.map((value) => ({ value, label: value }))}
                  ariaLabel="Quarter"
                />
              </label>
            </div>
            <label className={`${styles.uploadZone} ${validating ? styles.uploadBusy : ''}`}>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void chooseFile(file);
                }}
                disabled={validating || processing}
              />
              {validating ? <span className={styles.spinnerLarge} /> : <Upload size={24} />}
              <strong>{validating ? 'Validating file…' : `Choose ${kindLabel} CSV`}</strong>
              <span>
                {kind === 'KPI'
                  ? 'Expected columns: Name | KPI'
                  : 'Expected columns: Name | Average Quarter Mark'}
              </span>
            </label>
            <div className={styles.infoNote}>
              <Database size={17} />
              <p>
                The CSV is parsed locally. Comma, semicolon and pipe delimiters are supported. No file is
                uploaded to a server.{' '}
                <a href={`${import.meta.env.BASE_URL}samples/${kind === 'Evaluation' ? 'personal-cards' : 'kpi'}.csv`} download>
                  Download a sample
                </a>
                .
              </p>
            </div>
          </section>
          <aside className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Import contract</p>
                <h2>Validation sequence</h2>
              </div>
              <ShieldCheck size={20} />
            </div>
            <ol className={styles.stepList}>
              <li>
                <span>01</span>
                <div>
                  <strong>Match employees</strong>
                  <p>Unknown names stop final confirmation.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Calculate White Sparks</strong>
                  <p>Threshold rules remain in the service layer.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Apply Quality Gates</strong>
                  <p>Active gates produce zero White credit.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Protect unique keys</strong>
                  <p>Employee + source + quarter cannot duplicate.</p>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      )}

      {tab === 'Import' && preview && (
        <section className={`${styles.panel} ${styles.importPreview}`} aria-labelledby="preview-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Preview ready</p>
              <h2 id="preview-title">
                {preview.kind === 'Evaluation' ? 'Personal cards reward' : preview.kind} · {preview.quarter}
              </h2>
              <p>{preview.fileName}</p>
            </div>
            {preview.duplicate ? (
              <span className={styles.warningPill}>
                <AlertTriangle size={14} /> Existing period
              </span>
            ) : (
              <span className={styles.successPill}>
                <CheckCircle2 size={14} /> New period
              </span>
            )}
          </div>
          <div className={styles.previewMetrics}>
            <div>
              <span>Employees found</span>
              <strong>{preview.employeesFound}</strong>
            </div>
            <div>
              <span>Not found</span>
              <strong>{preview.employeesNotFound}</strong>
            </div>
            <div>
              <span>Invalid values</span>
              <strong>{preview.invalidValues}</strong>
            </div>
            <div>
              <span>Quality Gates</span>
              <strong>{preview.qualityGateActive}</strong>
            </div>
            <div>
              <span>Expected White</span>
              <strong>{preview.expectedWhiteSparks}</strong>
            </div>
          </div>
          <div className={styles.tableScroller} tabIndex={0} aria-label="Scrollable CSV validation results">
            <table className={styles.dataTable}>
              <caption className={styles.srOnly}>All parsed import rows and validation results</caption>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Employee</th>
                  <th>Value</th>
                  <th>Reward</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.lineNumber}>
                    <td>{row.lineNumber}</td>
                    <td>{row.employee}</td>
                    <td>{row.value}</td>
                    <td>{row.reward} White</td>
                    <td>
                      <StatusBadge status={row.status} />
                      {row.error && <p className={styles.mutedCopy}>{row.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.formFooter}>
            <p>
              {preview.employeesNotFound + preview.invalidValues > 0
                ? 'Fix the highlighted rows and upload a new preview.'
                : preview.duplicate
                  ? 'Replace recalculates the batch without creating duplicate credits.'
                  : 'No blocking validation issues found.'}
            </p>
            <button
              className={styles.primaryButton}
              disabled={processing || preview.employeesNotFound > 0 || preview.invalidValues > 0}
              type="button"
              onClick={() => (preview.duplicate ? setReplaceOpen(true) : void runImport(false))}
            >
              {processing ? <span className={styles.spinner} /> : <Upload size={16} />}
              {preview.duplicate ? 'Review replacement' : 'Confirm import'}
            </button>
          </div>
        </section>
      )}

      {tab === 'Directory' && <ReferenceManager key={resetKey} />}

      {tab === 'Rules' && (
        <div className={styles.adminRulesStack}>
          <div className={styles.adminGrid}>
            <EconomySettings key={resetKey} />
            <aside className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Role separation</p>
                  <h2>Administrator invariant</h2>
                </div>
                <ShieldCheck size={20} />
              </div>
              <p className={styles.largeNote}>
                Admin controls reference data and imports, but receives no award rights unless a separate
                business role is assigned.
              </p>
              <dl className={styles.miniDefinition}>
                <div>
                  <dt>Signed-in demo actor</dt>
                  <dd>{snapshot!.employees.find((item) => item.id === currentUserId)?.name}</dd>
                </div>
                <div>
                  <dt>Active capability</dt>
                  <dd>Configuration only</dd>
                </div>
                <div>
                  <dt>Current quarter</dt>
                  <dd>{snapshot!.settings.currentQuarter}</dd>
                </div>
              </dl>
            </aside>
          </div>
          <CategoryAwardSettings key={`category-awards-${resetKey}`} />
        </div>
      )}

      {tab === 'Audit' && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Audit trail</p>
              <h2>Recent system events</h2>
            </div>
            <History size={20} />
          </div>
          <div className={styles.auditList}>
            {[...snapshot!.auditEvents]
              .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
              .map((event) => (
              <article key={event.id}>
                <span className={styles.auditDot} />
                <div>
                  <strong>{event.action.replaceAll('_', ' ')}</strong>
                  <p>{event.details}</p>
                  <small>
                    {formatDateTime(event.dateTime)} · actor {event.actorId}
                  </small>
                </div>
              </article>
              ))}
          </div>
        </section>
      )}

      <Modal
        open={resetOpen}
        title="Reset all demo data?"
        description="This replaces every in-memory workspace change with the original C-Job Sparks demo dataset. Access approvals, shop balances, purchases and inventory are stored separately and are kept."
        onClose={() => setResetOpen(false)}
      >
        <div className={styles.warningBox}>
          <AlertTriangle size={19} />
          <p>Created recognitions, awards, conversions, imports and edited settings in this session will be lost. Registration approvals and shop records are not reset.</p>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} type="button" disabled={mutating} onClick={() => setResetOpen(false)}>
            Keep current data
          </button>
          <button
            className={styles.rejectButton}
            type="button"
            disabled={mutating}
            onClick={() => void runReset()}
          >
            <RefreshCcw size={16} /> Reset demo
          </button>
        </div>
      </Modal>

      <Modal
        open={replaceOpen}
        title={`Replace ${preview?.kind === 'Evaluation' ? 'Personal cards reward' : (preview?.kind ?? '')} import`}
        description={`Data already exists for ${preview?.quarter ?? 'this quarter'}. Replacement recalculates the batch without creating a second active reward.`}
        onClose={() => !processing && setReplaceOpen(false)}
      >
        <div className={styles.warningBox}>
          <AlertTriangle size={19} />
          <p>
            Existing rewards are offset by new correction transactions; historical rows are never edited. The
            whole batch is blocked if a correction would produce a negative balance.
          </p>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={processing}
            onClick={() => setReplaceOpen(false)}
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={processing}
            onClick={() => void runImport(true)}
          >
            {processing ? <span className={styles.spinner} /> : <RefreshCcw size={16} />} Replace import
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
