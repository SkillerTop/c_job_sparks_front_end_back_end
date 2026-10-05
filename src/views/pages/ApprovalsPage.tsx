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
import { formatDate } from '@/utils/formatters';
import { isQualityGateActive } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';

export function ApprovalsPage() {
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
        action={<span className={styles.countBadge}>{controller.queue.length} pending</span>}
      />
      {controller.message && <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>}
      <div className={styles.segmented} role="group" aria-label="Filter approval queue">
        {(['All', 'Recognition', 'Yellow Award'] as const).map((item) => (
          <button
            className={filter === item ? styles.segmentActive : ''}
            type="button"
            aria-pressed={filter === item}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
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
                    <span>White credit blocked by active Quality Gate</span>
                  </div>
                )}
                <dl className={styles.approvalFacts}>
                  <div>
                    <dt>Category</dt>
                    <dd>{item.category}</dd>
                  </div>
                  <div>
                    <dt>Awarded by</dt>
                    <dd>{sender.name}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
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
                    <X size={16} /> Reject
                  </button>
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
                    Approve
                  </button>
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
            Rejection reason <b>*</b>
          </span>
          <textarea
            data-autofocus
            required
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain what needs to change…"
          />
        </label>
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={Boolean(controller.processingId)}
            onClick={closeReject}
          >
            Cancel
          </button>
          <button
            className={styles.rejectButton}
            type="button"
            disabled={!reason.trim() || Boolean(controller.processingId)}
            onClick={() => void reject()}
          >
            <X size={16} /> Reject request
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
