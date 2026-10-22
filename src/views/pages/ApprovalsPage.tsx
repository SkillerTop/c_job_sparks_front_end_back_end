import { Check, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useApprovalController, type QueueItem } from '@/controllers/useApprovalController';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { formatDate } from '@/utils/formatters';
import { isQualityGateActive } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function ApprovalsPage() {
  const { localize } = useUserPreferences();
  const { snapshot } = useSpark();
  const controller = useApprovalController();
  const [filter, setFilter] = useState<'All' | 'Recognition' | 'Yellow Award'>('All');
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState('');
  const queue = controller.queue.filter((item) => filter === 'All' || item.kind === filter);
  const employee = (id: string) => snapshot!.employees.find((item) => item.id === id)!;
  const hasGate = (id: string) => isQualityGateActive(id, snapshot!.qualityGates);
  const closeReject = () => {
    if (!controller.processingId) {
      setRejecting(null);
      setReason('');
    }
  };
  const reject = async () => {
    if (!rejecting) return;
    const success = await controller.review(rejecting, 'Rejected', reason);
    if (success) {
      setRejecting(null);
      setReason('');
    }
  };
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Head of Department"
        title="Approval Center"
        description="Peer Recognition and Yellow requests are checked again against current Quality Gates, limits and duplicate rules at the moment of decision."
        action={<span className={styles.countBadge}>{controller.queue.length} <LocalizedText>pending</LocalizedText></span>}
      />
      {controller.message && <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>}
      <div className={styles.segmented} role="group" aria-label={localize('Filter approval queue')}>
        {(['All', 'Recognition', 'Yellow Award'] as const).map((item) => (
          <button
            className={filter === item ? styles.segmentActive : ''}
            type="button"
            aria-pressed={filter === item}
            key={item}
            onClick={() => setFilter(item)}
          >
            <LocalizedText>{item}</LocalizedText>
          </button>
        ))}
      </div>
      {queue.length === 0 ? (
        <EmptyState
          title="Approval queue is clear"
          description="New recognition and Yellow award requests will appear here."
        />
      ) : (
        <div className={styles.approvalGrid}>
          {queue.map((item) => {
            const person = employee(item.employeeId);
            const sender = employee(item.awardedBy);
            const gated = hasGate(item.employeeId);
            return (
              <article className={styles.approvalCard} key={item.id}>
                <header>
                  <div className={styles.personLine}>
                    <span className={styles.avatar}>{person.initials}</span>
                    <div>
                      <p>{item.kind}</p>
                      <h2>{person.name}</h2>
                      <span>{person.title}</span>
                    </div>
                  </div>
                  <SparkBadge type={item.kind === 'Recognition' ? 'White' : 'Yellow'} amount={item.amount} />
                </header>
                {gated && item.kind === 'Recognition' && (
                  <div className={styles.gateWarning}>
                    <ShieldAlert size={16} />
                    <span><LocalizedText>White credit blocked by active Quality Gate</LocalizedText></span>
                  </div>
                )}
                <dl className={styles.approvalFacts}>
                  <div>
                    <dt><LocalizedText>Category</LocalizedText></dt>
                    <dd>{item.category}</dd>
                  </div>
                  <div>
                    <dt><LocalizedText>Awarded by</LocalizedText></dt>
                    <dd>{sender.name}</dd>
                  </div>
                  <div>
                    <dt><LocalizedText>Date</LocalizedText></dt>
                    <dd>{formatDate(item.createdAt)}</dd>
                  </div>
                </dl>
                <blockquote>{item.description}</blockquote>
                <footer>
                  <button
                    className={styles.rejectButton}
                    disabled={Boolean(controller.processingId)}
                    type="button"
                    onClick={() => setRejecting(item)}
                  >
                    <X size={16} /> <LocalizedText>Reject
                  </LocalizedText></button>
                  <button
                    className={styles.approveButton}
                    disabled={Boolean(controller.processingId) || (gated && item.kind === 'Recognition')}
                    type="button"
                    onClick={() => void controller.review(item, 'Approved')}
                  >
                    {controller.processingId === item.id ? (
                      <span className={styles.spinner} />
                    ) : (
                      <Check size={16} />
                    )}{' '}
                    <LocalizedText>Approve
                  </LocalizedText></button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      <Modal
        open={Boolean(rejecting)}
        title="Reject request"
        description="The reason is stored with the request. Rejected Peer nominations become reusable."
        onClose={closeReject}
      >
        {controller.message?.tone === 'error' && <Feedback tone="error">{controller.message.text}</Feedback>}
        <label className={styles.formField}>
          <span>
            <LocalizedText>Rejection reason </LocalizedText><b>*</b>
          </span>
          <textarea
            data-autofocus
            required
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={localize('Explain what needs to change…')}
          />
        </label>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={Boolean(controller.processingId)}
            onClick={closeReject}
          >
            <LocalizedText>Cancel
          </LocalizedText></button>
          <button
            className={styles.rejectButton}
            type="button"
            disabled={!reason.trim() || Boolean(controller.processingId)}
            onClick={() => void reject()}
          >
            <X size={16} /> <LocalizedText>Reject request
          </LocalizedText></button>
        </div>
      </Modal>
    </PageTransition>
  );
}
