import { Coins, Flame, Info, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { DisenchantSelection, SparkType } from '@/models';
import { formatMoney } from '@/utils/sparkRules';
import { selectAuthoritativeBalances } from '@/utils/personalBalances';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


type DisenchantType = Exclude<SparkType, 'Radiant'>;
const DISENCHANT_TYPES: DisenchantType[] = ['White', 'Yellow', 'Blue'];

export function DisenchantPage() {
  const { localize } = useUserPreferences();
  const { snapshot, currentUserId, disenchant, cancelDisenchantRequest } = useSpark();
  const [amounts, setAmounts] = useState<Record<DisenchantType, number>>({ White: 1, Yellow: 0, Blue: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => setCelebrate(false), reduced ? 50 : 1600);
    return () => window.clearTimeout(timer);
  }, [celebrate, reduced]);
  const balances = useMemo(
    () => selectAuthoritativeBalances(snapshot!, currentUserId),
    [snapshot, currentUserId],
  );
  const settings = snapshot!.settings;
  const cancellableRequests = snapshot!.disenchantRequests.filter(
    (request) => request.employeeId === currentUserId && request.status === 'Created',
  );
  useEffect(() => {
    setAmounts((current) => Object.fromEntries(DISENCHANT_TYPES.map((sparkType) => [
      sparkType,
      Math.min(Math.max(0, current[sparkType]), balances[sparkType]),
    ])) as Record<DisenchantType, number>);
  }, [balances]);
  const components = useMemo<DisenchantSelection[]>(
    () => DISENCHANT_TYPES
      .filter((sparkType) => amounts[sparkType] > 0)
      .map((sparkType) => ({ sparkType, amount: amounts[sparkType] })),
    [amounts],
  );
  const moneyValues = useMemo(
    () => Object.fromEntries(DISENCHANT_TYPES.map((sparkType) => [
      sparkType,
      Math.round(settings.sparkMoneyValues[sparkType] * amounts[sparkType] * settings.disenchantRate * 100) / 100,
    ])) as Record<DisenchantType, number>,
    [settings, amounts],
  );
  const totalMoneyValue = useMemo(
    () => Math.round(components.reduce((total, component) => total + moneyValues[component.sparkType], 0) * 100) / 100,
    [components, moneyValues],
  );
  const toggleType = (sparkType: DisenchantType) => {
    setAmounts((current) => ({
      ...current,
      [sparkType]: current[sparkType] > 0 ? 0 : Math.min(1, balances[sparkType]),
    }));
    setMessage(null);
  };
  const confirm = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const result = await disenchant(components);
      setConfirmOpen(false);
      setCelebrate(true);
      setMessage({
        tone: 'success',
        text: `${localize(result.requests.length === 1 ? 'Disenchant request created for' : 'Disenchant requests created for')} ${formatMoney(result.totalMoneyValue, result.currency)}. ${localize('Sparks were deducted immediately and added to the monthly accounting list.')}`,
      });
    } catch (caught) {
      setConfirmOpen(false);
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not create the request.',
      });
    } finally {
      setProcessing(false);
    }
  };
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Accounting request"
        title="Disenchant Sparks"
        description="Turn eligible Sparks into a monthly payout request. C-Job Sparks prepares accounting data; it does not execute payment."
      />
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.operationLayout}>
        <section className={`${styles.panel} ${styles.operationPanel}`}>
          <div className={styles.formField}>
            <span><LocalizedText>Spark types</LocalizedText></span>
            <small><LocalizedText>Select every Spark type you want to include in this request.</LocalizedText></small>
            <div className={styles.sparkTypeOptions} role="group" aria-label={localize('Spark types')}>
              {DISENCHANT_TYPES.map((spark) => (
                <button
                  type="button"
                  key={spark}
                  aria-pressed={amounts[spark] > 0}
                  className={amounts[spark] > 0 ? styles.sparkTypeActive : ''}
                  disabled={balances[spark] === 0}
                  onClick={() => toggleType(spark)}
                >
                  <SparkBadge type={spark} />
                  <small>{balances[spark]} <LocalizedText>available</LocalizedText></small>
                </button>
              ))}
              <button type="button" disabled title={localize('Radiant Sparks are permanent')}>
                <SparkBadge type="Radiant" />
                <small><LocalizedText>Permanent</LocalizedText></small>
              </button>
            </div>
          </div>
          {components.length > 0 ? (
            <div className={styles.disenchantAmountGrid} aria-label={localize('Selected Spark amounts')}>
              {components.map((component) => (
                <label className={styles.disenchantAmountRow} key={component.sparkType}>
                  <span>
                    <SparkBadge type={component.sparkType} />
                    <small>{balances[component.sparkType]} <LocalizedText>available</LocalizedText></small>
                  </span>
                  <span className={styles.disenchantAmountInput}>
                    <LocalizedText>Amount</LocalizedText>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={balances[component.sparkType]}
                      value={component.amount || ''}
                      onChange={(event) => {
                        const parsed = Math.floor(Number(event.target.value));
                        const next = event.target.value === '' || !Number.isFinite(parsed)
                          ? 0
                          : Math.min(balances[component.sparkType], Math.max(0, parsed));
                        setAmounts((current) => ({ ...current, [component.sparkType]: next }));
                        setMessage(null);
                      }}
                    />
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className={styles.infoNote}><Info size={17} /><p><LocalizedText>Choose at least one available Spark type.</LocalizedText></p></div>
          )}
          <div className={styles.payoutCard}>
            <div className={styles.payoutCopy}>
              <p><LocalizedText>Total estimated money value</LocalizedText></p>
              <strong>{formatMoney(totalMoneyValue, settings.currency)}</strong>
              <span><LocalizedText>Calculated according to the current C-Job policy</LocalizedText></span>
            </div>
            <span className={`${styles.largeIcon} ${styles.toneWhite}`}>
              <Coins size={24} />
            </span>
          </div>
          <div className={styles.infoNote}>
            <Info size={17} />
            <p>
              <strong><LocalizedText>Current C-Job policy.</LocalizedText></strong> <LocalizedText>Admin can update future operations conditions without changing
              previous requests.
            </LocalizedText></p>
          </div>
          <button
            className={styles.primaryButtonWide}
            type="button"
            disabled={components.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Flame size={17} /> <LocalizedText>Review disenchant
          </LocalizedText></button>
        </section>
        <aside className={styles.sideStack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>Monthly workflow</LocalizedText></p>
                <h2><LocalizedText>What happens next</LocalizedText></h2>
              </div>
            </div>
            <ol className={styles.stepList}>
              <li>
                <span>01</span>
                <div>
                  <strong><LocalizedText>Sparks debit immediately</LocalizedText></strong>
                  <p><LocalizedText>A permanent negative Ledger transaction is created.</LocalizedText></p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong><LocalizedText>Request enters accounting</LocalizedText></strong>
                  <p><LocalizedText>Your Head sees the amount, rate and period.</LocalizedText></p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong><LocalizedText>Payroll handles payment</LocalizedText></strong>
                  <p><LocalizedText>The application itself never moves money.</LocalizedText></p>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
      {cancellableRequests.length > 0 && (
        <section className={styles.panel} aria-labelledby="cancellable-disenchant-title">
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}><LocalizedText>Your requests</LocalizedText></p>
              <h2 id="cancellable-disenchant-title"><LocalizedText>Requests awaiting export</LocalizedText></h2></div>
          </div>
          <div className={styles.approvalList}>
            {cancellableRequests.map((request) => (
              <article key={request.id} className={styles.approvalCard}>
                <div><SparkBadge type={request.sparkType} amount={-request.amount} />
                  <p>{formatMoney(request.moneyValue, request.currency)}</p></div>
                <button className={styles.dangerButton} type="button" disabled={processing}
                  onClick={() => void (async () => {
                    setProcessing(true); setMessage(null);
                    try {
                      await cancelDisenchantRequest(request.id, 'Cancelled by employee before accounting export.');
                      setMessage({ tone: 'success', text: localize('Request cancelled and Sparks returned to your balance.') });
                    } catch (caught) {
                      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : localize('Could not cancel the request.') });
                    } finally { setProcessing(false); }
                  })()}>
                  <LocalizedText>Cancel request</LocalizedText>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <AnimatePresence>
        {celebrate && (
          <motion.div
            className={styles.sparkBurst}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <motion.span
                key={index}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={
                  reduced
                    ? { opacity: 0 }
                    : {
                        x: Math.cos(index * 0.53) * (80 + index * 4),
                        y: Math.sin(index * 0.53) * (80 + index * 3),
                        opacity: 0,
                        rotate: index * 38,
                      }
                }
                transition={{ duration: 1.2 }}
              >
                <Sparkles size={16} />
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <Modal
        open={confirmOpen}
        title="Confirm disenchant"
        description="Review every selected Spark amount and the total value. Sparks are deducted immediately."
        onClose={() => !processing && setConfirmOpen(false)}
      >
        <div className={styles.disenchantReviewList}>
          {components.map((component) => (
            <div className={styles.disenchantReviewRow} key={component.sparkType}>
              <SparkBadge type={component.sparkType} amount={-component.amount} />
              <strong>{formatMoney(moneyValues[component.sparkType], settings.currency)}</strong>
            </div>
          ))}
          <div className={styles.disenchantReviewTotal}>
            <span><LocalizedText>Total selected value</LocalizedText></span>
            <strong>{formatMoney(totalMoneyValue, settings.currency)}</strong>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={processing}
            onClick={() => setConfirmOpen(false)}
          >
            <LocalizedText>Cancel
          </LocalizedText></button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={processing}
            onClick={() => void confirm()}
          >
            {processing ? <span className={styles.spinner} /> : <Flame size={16} />}
            <LocalizedText>{processing ? 'Creating…' : 'Confirm request'}</LocalizedText>
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
