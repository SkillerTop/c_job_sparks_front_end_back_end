import {
  AlertTriangle,
  Banknote,
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
import { DisenchantAdminPanel } from '@/views/components/admin/DisenchantAdminPanel';
import { useSpark } from '@/controllers/SparkContext';
import type { ImportPreview } from '@/models';
import { formatDateTime } from '@/utils/formatters';
import { quarterForDate } from '@/utils/quarter';
import { useAppMode } from '@/controllers/useAppMode';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';
import adminStyles from '@/views/styles/admin.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


type Tab = 'Access' | 'Shop' | 'Accounting' | 'Import' | 'Directory' | 'Rules' | 'Audit';
const ADMIN_TABS: Tab[] = ['Access', 'Shop', 'Accounting', 'Import', 'Directory', 'Rules', 'Audit'];

export function AdminPage() {
  const { localize } = useUserPreferences();
  const { isApiMode } = useAppMode();
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
    <PageTransition className={adminStyles.adminPage}>
      <PageHeader
        eyebrow="System administration"
        title="Admin Settings"
        description="Review account access, manage the reward shop, validate imports and configure Spark rules. Administrative access does not grant award permissions."
        action={!isApiMode ? (
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={mutating || validating}
            onClick={() => setResetOpen(true)}
          >
            <RefreshCcw size={15} /> <LocalizedText>Reset demo
          </LocalizedText></button>
        ) : undefined}
      />
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.adminTabs} role="group" aria-label={localize('Admin sections')}>
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
            ) : item === 'Accounting' ? (
              <Banknote size={16} />
            ) : item === 'Import' ? (
              <Upload size={16} />
            ) : item === 'Directory' ? (
              <Users size={16} />
            ) : item === 'Rules' ? (
              <Settings2 size={16} />
            ) : (
              <History size={16} />
            )}
            <LocalizedText>{item}</LocalizedText>
          </button>
        ))}
      </div>

      {tab === 'Access' && <RegistrationManager />}

      {tab === 'Shop' && <ShopAdminPanel />}

      {tab === 'Accounting' && <DisenchantAdminPanel />}

      {tab === 'Import' && (
        <div className={styles.adminGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>CSV data import</LocalizedText></p>
                <h2><LocalizedText>Prepare a validated batch</LocalizedText></h2>
              </div>
              <FileSpreadsheet size={21} />
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.formField}>
                <span><LocalizedText>Data source</LocalizedText></span>
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
                <span><LocalizedText>Quarter</LocalizedText></span>
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
              <strong><LocalizedText>{validating ? 'Validating file…' : `Choose ${kindLabel} CSV`}</LocalizedText></strong>
              <span>
                <LocalizedText>{kind === 'KPI'
                  ? 'Expected columns: Name/Resource | KPI/Efficiency'
                  : 'Expected columns: Name/Resource | Average Quarter Mark/Personal cards'}</LocalizedText>
              </span>
            </label>
            <div className={styles.infoNote}>
              <Database size={17} />
              <p>
                <LocalizedText>{isApiMode
                  ? 'The CSV is uploaded to the backend for preview and validation. Comma, semicolon and pipe delimiters are supported. '
                  : 'The CSV is parsed locally. Comma, semicolon and pipe delimiters are supported. No file is uploaded to a server. '}</LocalizedText>
                <a href={`${import.meta.env.BASE_URL}samples/${kind === 'Evaluation' ? 'personal-cards' : 'kpi'}.csv`} download>
                  <LocalizedText>Download a sample
                </LocalizedText></a>
                .
              </p>
            </div>
          </section>
          <aside className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>Import contract</LocalizedText></p>
                <h2><LocalizedText>Validation sequence</LocalizedText></h2>
              </div>
              <ShieldCheck size={20} />
            </div>
            <ol className={styles.stepList}>
              <li>
                <span>01</span>
                <div>
                  <strong><LocalizedText>Match employees</LocalizedText></strong>
                  <p><LocalizedText>Unknown names stop final confirmation.</LocalizedText></p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong><LocalizedText>Calculate White Sparks</LocalizedText></strong>
                  <p><LocalizedText>Threshold rules remain in the service layer.</LocalizedText></p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong><LocalizedText>Apply Quality Gates</LocalizedText></strong>
                  <p><LocalizedText>Active gates produce zero White credit.</LocalizedText></p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong><LocalizedText>Protect unique keys</LocalizedText></strong>
                  <p><LocalizedText>Employee + source + quarter cannot duplicate.</LocalizedText></p>
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
              <p className={styles.eyebrow}><LocalizedText>Preview ready</LocalizedText></p>
              <h2 id="preview-title">
                <LocalizedText>{preview.kind === 'Evaluation' ? 'Personal cards reward' : preview.kind}</LocalizedText> · {preview.quarter}
              </h2>
              <p>{preview.fileName}</p>
            </div>
            {preview.duplicate ? (
              <span className={styles.warningPill}>
                <AlertTriangle size={14} /> <LocalizedText>Existing period
              </LocalizedText></span>
            ) : (
              <span className={styles.successPill}>
                <CheckCircle2 size={14} /> <LocalizedText>New period
              </LocalizedText></span>
            )}
          </div>
          <div className={styles.previewMetrics}>
            <div>
              <span><LocalizedText>Employees found</LocalizedText></span>
              <strong>{preview.employeesFound}</strong>
            </div>
            <div>
              <span><LocalizedText>Not found</LocalizedText></span>
              <strong>{preview.employeesNotFound}</strong>
            </div>
            <div>
              <span><LocalizedText>Invalid values</LocalizedText></span>
              <strong>{preview.invalidValues}</strong>
            </div>
            <div>
              <span><LocalizedText>Quality Gates</LocalizedText></span>
              <strong>{preview.qualityGateActive}</strong>
            </div>
            <div>
              <span><LocalizedText>Expected White</LocalizedText></span>
              <strong>{preview.expectedWhiteSparks}</strong>
            </div>
          </div>
          <div className={styles.tableScroller} tabIndex={0} aria-label={localize('Scrollable CSV validation results')}>
            <table className={styles.dataTable}>
              <caption className={styles.srOnly}><LocalizedText>All parsed import rows and validation results</LocalizedText></caption>
              <thead>
                <tr>
                  <th><LocalizedText>Line</LocalizedText></th>
                  <th><LocalizedText>Employee</LocalizedText></th>
                  <th><LocalizedText>Value</LocalizedText></th>
                  <th><LocalizedText>Reward</LocalizedText></th>
                  <th><LocalizedText>Status</LocalizedText></th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.lineNumber}>
                    <td>{row.lineNumber}</td>
                    <td>{row.employee}</td>
                    <td>{row.value}</td>
                    <td>{row.reward} <LocalizedText>White</LocalizedText></td>
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
            <p><LocalizedText>
              {preview.employeesNotFound + preview.invalidValues > 0
                ? 'Fix the highlighted rows and upload a new preview.'
                : preview.duplicate
                  ? 'Replace recalculates the batch without creating duplicate credits.'
                  : 'No blocking validation issues found.'}
            </LocalizedText></p>
            <button
              className={styles.primaryButton}
              disabled={processing || preview.employeesNotFound > 0 || preview.invalidValues > 0}
              type="button"
              onClick={() => (preview.duplicate ? setReplaceOpen(true) : void runImport(false))}
            >
              {processing ? <span className={styles.spinner} /> : <Upload size={16} />}
              <LocalizedText>{preview.duplicate ? 'Review replacement' : 'Confirm import'}</LocalizedText>
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
                  <p className={styles.eyebrow}><LocalizedText>Role separation</LocalizedText></p>
                  <h2><LocalizedText>Administrator invariant</LocalizedText></h2>
                </div>
                <ShieldCheck size={20} />
              </div>
              <p className={styles.largeNote}>
                <LocalizedText>Admin controls reference data and imports, but receives no award rights unless a separate
                business role is assigned.
              </LocalizedText></p>
              <dl className={styles.miniDefinition}>
                <div>
                  <dt><LocalizedText>{isApiMode ? 'Signed-in administrator' : 'Signed-in demo actor'}</LocalizedText></dt>
                  <dd>{snapshot!.employees.find((item) => item.id === currentUserId)?.name}</dd>
                </div>
                <div>
                  <dt><LocalizedText>Active capability</LocalizedText></dt>
                  <dd><LocalizedText>Configuration only</LocalizedText></dd>
                </div>
                <div>
                  <dt><LocalizedText>Current quarter</LocalizedText></dt>
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
              <p className={styles.eyebrow}><LocalizedText>Audit trail</LocalizedText></p>
              <h2><LocalizedText>Recent system events</LocalizedText></h2>
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
                    {formatDateTime(event.dateTime)} <LocalizedText>· actor </LocalizedText>{event.actorId}
                  </small>
                </div>
              </article>
              ))}
          </div>
        </section>
      )}

      {!isApiMode && (
        <Modal
          open={resetOpen}
          title="Reset all demo data?"
          description="This replaces every in-memory workspace change with the original C-Job Sparks demo dataset. Access approvals, shop balances, purchases and inventory are stored separately and are kept."
          onClose={() => setResetOpen(false)}
        >
          <div className={styles.warningBox}>
            <AlertTriangle size={19} />
            <p><LocalizedText>Created recognitions, awards, conversions, imports and edited settings in this session will be lost. Registration approvals and shop records are not reset.</LocalizedText></p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" disabled={mutating} onClick={() => setResetOpen(false)}>
              <LocalizedText>Keep current data
            </LocalizedText></button>
            <button
              className={styles.rejectButton}
              type="button"
              disabled={mutating}
              onClick={() => void runReset()}
            >
              <RefreshCcw size={16} /> <LocalizedText>Reset demo
            </LocalizedText></button>
          </div>
        </Modal>
      )}

      <Modal
        open={replaceOpen}
        title={`Replace ${preview?.kind === 'Evaluation' ? 'Personal cards reward' : (preview?.kind ?? '')} import`}
        description={`Data already exists for ${preview?.quarter ?? 'this quarter'}. Replacement recalculates the batch without creating a second active reward.`}
        onClose={() => !processing && setReplaceOpen(false)}
      >
        <div className={styles.warningBox}>
          <AlertTriangle size={19} />
          <p>
            <LocalizedText>Existing rewards are offset by new correction transactions; historical rows are never edited. The
            whole batch is blocked if a correction would produce a negative balance.
          </LocalizedText></p>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={processing}
            onClick={() => setReplaceOpen(false)}
          >
            <LocalizedText>Cancel
          </LocalizedText></button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={processing}
            onClick={() => void runImport(true)}
          >
            {processing ? <span className={styles.spinner} /> : <RefreshCcw size={16} />} <LocalizedText>Replace import
          </LocalizedText></button>
        </div>
      </Modal>
    </PageTransition>
  );
}
