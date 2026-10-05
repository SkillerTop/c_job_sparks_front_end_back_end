import { Coins, Flame, Info, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useSpark } from '@/controllers/SparkContext';
import type { SparkType } from '@/models';
import { calculateBalances, formatMoney } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';

type DisenchantType = Exclude<SparkType, 'Radiant'>;

export function DisenchantPage() {
  const { snapshot, currentUserId, disenchant } = useSpark();
  const [type, setType] = useState<DisenchantType>('White');
  const [amount, setAmount] = useState(1);
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
  const balances = calculateBalances(snapshot!.transactions, currentUserId);
  const settings = snapshot!.settings;
  useEffect(() => {
    setAmount((current) => Math.min(Math.max(balances[type] > 0 ? 1 : 0, current), balances[type]));
  }, [balances[type], type]);
  const moneyValue = useMemo(
    () => Math.round(settings.sparkMoneyValues[type] * amount * settings.disenchantRate * 100) / 100,
    [settings, type, amount],
  );
  const confirm = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const result = await disenchant(type, amount);
      setConfirmOpen(false);
      setCelebrate(true);
      setMessage({
        tone: 'success',
        text: `Request created for ${formatMoney(result.moneyValue, result.currency)}. Sparks were deducted immediately and added to the monthly accounting list.`,
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
            <span>Spark type</span>
            <div className={styles.sparkTypeOptions} role="group" aria-label="Spark type">
              {(['White', 'Yellow', 'Blue'] as DisenchantType[]).map((spark) => (
                <button
                  type="button"
                  key={spark}
                  aria-pressed={type === spark}
                  className={type === spark ? styles.sparkTypeActive : ''}
                  onClick={() => {
                    setType(spark);
                    setAmount(Math.min(1, balances[spark]));
                    setMessage(null);
                  }}
                >
                  <SparkBadge type={spark} />
                </button>
              ))}
              <button type="button" disabled title="Radiant Sparks are permanent">
                <SparkBadge type="Radiant" />
                <small>Permanent</small>
              </button>
            </div>
          </div>
          <label className={styles.formField}>
            <span>Amount</span>
            <input
              type="number"
              min={balances[type] > 0 ? 1 : 0}
              step="1"
              max={balances[type]}
              value={amount}
              onChange={(event) => {
                const next = Math.floor(Number(event.target.value));
                const minimum = balances[type] > 0 ? 1 : 0;
                setAmount(Number.isFinite(next) ? Math.min(balances[type], Math.max(minimum, next)) : minimum);
                setMessage(null);
              }}
            />
            <small>
              {balances[type]} {type} Sparks available
            </small>
          </label>
          <div className={styles.payoutCard}>
            <div className={styles.payoutCopy}>
              <p>Estimated money value</p>
              <strong>{formatMoney(moneyValue, settings.currency)}</strong>
              <span>Calculated according to the current C-Job policy</span>
            </div>
            <span className={`${styles.largeIcon} ${styles[`tone${type}`]}`}>
              <Coins size={24} />
            </span>
          </div>
          <div className={styles.infoNote}>
            <Info size={17} />
            <p>
              <strong>Current C-Job policy.</strong> Admin can update future operations conditions without changing
              previous requests.
            </p>
          </div>
          <button
            className={styles.primaryButtonWide}
            type="button"
            disabled={balances[type] === 0 || amount < 1 || amount > balances[type]}
            onClick={() => setConfirmOpen(true)}
          >
            <Flame size={17} /> Review disenchant
          </button>
        </section>
        <aside className={styles.sideStack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Monthly workflow</p>
                <h2>What happens next</h2>
              </div>
            </div>
            <ol className={styles.stepList}>
              <li>
                <span>01</span>
                <div>
                  <strong>Sparks debit immediately</strong>
                  <p>A permanent negative Ledger transaction is created.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Request enters accounting</strong>
                  <p>Your Head sees the amount, rate and period.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Payroll handles payment</strong>
                  <p>The application itself never moves money.</p>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
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
        description="Sparks are deducted immediately. The payout is processed later by Accounting."
        onClose={() => !processing && setConfirmOpen(false)}
      >
        <div className={styles.confirmSummary}>
          <SparkBadge type={type} amount={-amount} />
          <span className={styles.confirmEquals}>=</span>
          <strong>{formatMoney(moneyValue, settings.currency)}</strong>
        </div>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={processing}
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={processing}
            onClick={() => void confirm()}
          >
            {processing ? <span className={styles.spinner} /> : <Flame size={16} />}
            {processing ? 'Creating…' : 'Confirm request'}
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
