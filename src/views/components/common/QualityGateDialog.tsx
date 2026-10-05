import { useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Employee, QualityGate, QualityGateInput } from '@/models';
import { todayIso } from '@/utils/quarter';
import { formatDate } from '@/utils/formatters';
import { Modal } from './Modal';
import { Feedback } from './Feedback';
import styles from '@/views/styles/app.module.css';

export function QualityGateDialog({
  employee,
  gate,
  onClose,
  onConfirm,
}: {
  employee: Employee;
  gate?: QualityGate;
  onClose: () => void;
  onConfirm: (input?: QualityGateInput) => Promise<void>;
}) {
  const [input, setInput] = useState<QualityGateInput>({
    startDate: todayIso(),
    endDate: todayIso(),
    reason: '',
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!gate && input.endDate < todayIso()) {
      setError('End date cannot be in the past.');
      return;
    }
    if (!gate && input.endDate < input.startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      await onConfirm(gate ? undefined : input);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the Quality Gate.');
    } finally {
      setProcessing(false);
    }
  };
  return (
    <Modal
      open
      title={gate ? 'Cancel Quality Gate' : 'Set a Quality Gate'}
      description={`${employee.name} · ${employee.title}`}
      onClose={() => !processing && onClose()}
    >
      <form onSubmit={(event) => void submit(event)}>
        {error && <Feedback tone="error">{error}</Feedback>}
        {gate ? (
          <div className={styles.warningBox}>
            <ShieldAlert size={19} />
            <p>
              {gate.reason}
              <br />
              {formatDate(gate.startDate)} – {formatDate(gate.endDate)}. Cancelling allows future White
              credits; blocked past rewards are not automatically restored.
            </p>
          </div>
        ) : (
          <div className={styles.fieldGrid}>
            <label className={styles.formField}>
              <span>Start date *</span>
              <input
                type="date"
                required
                min={todayIso()}
                value={input.startDate}
                onChange={(event) => {
                  const startDate = event.target.value;
                  setError('');
                  setInput((current) => ({
                    ...current,
                    startDate,
                    endDate: current.endDate < startDate ? startDate : current.endDate,
                  }));
                }}
              />
            </label>
            <label className={styles.formField}>
              <span>End date *</span>
              <input
                type="date"
                required
                min={input.startDate > todayIso() ? input.startDate : todayIso()}
                value={input.endDate}
                onChange={(event) => {
                  setError('');
                  setInput((current) => ({ ...current, endDate: event.target.value }));
                }}
              />
            </label>
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>Reason *</span>
              <textarea
                required
                rows={4}
                value={input.reason}
                onChange={(event) => {
                  setError('');
                  setInput((current) => ({ ...current, reason: event.target.value }));
                }}
                placeholder="Describe the issue, remediation and review criteria…"
              />
            </label>
          </div>
        )}
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} type="button" disabled={processing} onClick={onClose}>
            Back
          </button>
          <button
            className={gate ? styles.primaryButton : styles.rejectButton}
            type="submit"
            disabled={processing}
          >
            {processing ? <span className={styles.spinner} /> : <ShieldAlert size={16} />}
            {gate ? 'Cancel gate' : 'Save gate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
