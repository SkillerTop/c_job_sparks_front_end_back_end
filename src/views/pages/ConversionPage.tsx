import { ArrowRight, Info, LockKeyhole, Repeat2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { SparkType } from '@/models';
import { calculateBalances, conversionRule } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function ConversionPage() {
  const { localize } = useUserPreferences();
  const { snapshot, currentUserId, convert } = useSpark();
  const [from, setFrom] = useState<SparkType>('White');
  const rule = conversionRule(from, snapshot!.settings)!;
  const [amount, setAmount] = useState(rule.ratio);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const balances = calculateBalances(snapshot!.transactions, currentUserId);
  const output = useMemo(
    () => (amount > 0 && amount % rule.ratio === 0 ? amount / rule.ratio : 0),
    [amount, rule.ratio],
  );
  const feeAmount = output * rule.fee;
  const totalDebit = output ? amount + feeAmount : 0;
  const selectFrom = (type: SparkType) => {
    const next = conversionRule(type, snapshot!.settings);
    if (!next) return;
    setFrom(type);
    setAmount(next.ratio);
    setMessage(null);
  };
  const confirm = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const result = await convert(from, amount);
      setMessage({
        tone: 'success',
        text: `${result.totalDebited} ${from} debited (${amount} exchange + ${result.fee} fee) to receive ${result.output} ${result.to}. The Ledger now contains linked debit and credit entries.`,
      });
      setConfirmOpen(false);
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Conversion failed.' });
      setConfirmOpen(false);
    } finally {
      setProcessing(false);
    }
  };
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Spark economy"
        title="Convert Sparks"
        description="Build higher-tier Sparks from your available balance. Blue and Radiant Sparks are intentionally not convertible."
      />
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.operationLayout}>
        <section className={`${styles.panel} ${styles.operationPanel}`}>
          <div className={styles.segmented} role="group" aria-label={localize('Source Spark type')}>
            <button
              className={from === 'White' ? styles.segmentActive : ''}
              aria-pressed={from === 'White'}
              type="button"
              onClick={() => selectFrom('White')}
            >
              <LocalizedText>White → Yellow
            </LocalizedText></button>
            <button
              className={from === 'Yellow' ? styles.segmentActive : ''}
              aria-pressed={from === 'Yellow'}
              type="button"
              onClick={() => selectFrom('Yellow')}
            >
              <LocalizedText>Yellow → Blue
            </LocalizedText></button>
          </div>
          <div className={styles.conversionFlow}>
            <div className={`${styles.conversionBox} ${styles[`tone${from}`]}`}>
              <span><LocalizedText>From your balance</LocalizedText></span>
              <SparkBadge type={from} />
              <label>
                <span className={styles.srOnly}><LocalizedText>Amount to convert</LocalizedText></span>
                <input
                  type="number"
                  min={rule.ratio}
                  step={rule.ratio}
                  value={amount}
                  onChange={(event) => {
                    setAmount(Number(event.target.value));
                    setMessage(null);
                  }}
                />
              </label>
              <small>{balances[from]} <LocalizedText>available</LocalizedText></small>
            </div>
            <span className={styles.flowArrow}>
              <ArrowRight size={20} />
            </span>
            <div className={`${styles.conversionBox} ${styles[`tone${rule.to}`]}`}>
              <span><LocalizedText>You receive</LocalizedText></span>
              <SparkBadge type={rule.to} />
              <strong>{output}</strong>
              <small><LocalizedText>after confirmation</LocalizedText></small>
            </div>
          </div>
          <div className={styles.feeRow}>
            <span>
              <Info size={16} />
              <LocalizedText>Configured ratio
            </LocalizedText></span>
            <strong>
              {rule.ratio} {from} = 1 {rule.to}
            </strong>
          </div>
          <div className={`${styles.feeRow} ${styles.conversionFeeRow}`}>
            <span>
              <Repeat2 size={16} />
              <LocalizedText>Conversion fee (added)
            </LocalizedText></span>
            <strong>
              {rule.fee} {from} <LocalizedText>per complete bundle
            </LocalizedText></strong>
          </div>
          <div className={styles.feeRow}>
            <span><LocalizedText>Total debit per complete bundle</LocalizedText></span>
            <strong>
              {totalDebit} {from}
            </strong>
          </div>
          <button
            className={styles.primaryButtonWide}
            type="button"
            disabled={!output || totalDebit > balances[from]}
            onClick={() => setConfirmOpen(true)}
          >
            <Sparkles size={17} /> <LocalizedText>Review conversion
          </LocalizedText></button>
          {output > 0 && totalDebit > balances[from] && (
            <p className={styles.mutedCopy}>
              <LocalizedText>You need </LocalizedText>{totalDebit - balances[from]} <LocalizedText>more </LocalizedText>{from} <LocalizedText>Sparks for this conversion.
            </LocalizedText></p>
          )}
        </section>
        <aside className={styles.sideStack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>Safeguards</LocalizedText></p>
                <h2><LocalizedText>Before you convert</LocalizedText></h2>
              </div>
              <LockKeyhole size={20} />
            </div>
            <ul className={styles.checkList}>
              <li><LocalizedText>Convert only complete bundles shown on this page.</LocalizedText></li>
              <li><LocalizedText>The amount cannot exceed your available balance.</LocalizedText></li>
              <li><LocalizedText>A confirmed conversion is permanent and appears in your Spark Ledger.</LocalizedText></li>
            </ul>
          </section>
        </aside>
      </div>
      <Modal
        open={confirmOpen}
        title="Confirm Spark conversion"
        description="This action creates two permanent Ledger entries."
        onClose={() => !processing && setConfirmOpen(false)}
      >
        <div className={styles.confirmSummary}>
          <div>
            <SparkBadge type={from} amount={-totalDebit} />
          </div>
          <ArrowRight size={19} />
          <div>
            <SparkBadge type={rule.to} amount={output} />
          </div>
        </div>
        <p className={styles.mutedCopy}>
          {amount} {from} <LocalizedText>exchange + </LocalizedText>{feeAmount} {from} <LocalizedText>fee = </LocalizedText>{totalDebit} {from} <LocalizedText>total debit.
        </LocalizedText></p>
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
            {processing ? <span className={styles.spinner} /> : <Repeat2 size={16} />}
            <LocalizedText>{processing ? 'Converting…' : 'Confirm conversion'}</LocalizedText>
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
