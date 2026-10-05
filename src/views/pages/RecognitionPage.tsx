import { CalendarClock, Clock3, RotateCcw, Send, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { EmptyState } from '@/views/components/common/EmptyState';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { useRecognitionController } from '@/controllers/useRecognitionController';
import { useSpark } from '@/controllers/SparkContext';
import { formatDate } from '@/utils/formatters';
import { focusFirstInvalid } from '@/utils/accessibility';
import { quarterEndLabel } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';

export function RecognitionPage() {
  const controller = useRecognitionController();
  const { snapshot, activeRole } = useSpark();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const remaining = Math.max(0, controller.quota - controller.usedCount);
  const canExpandHistory = ['Coordinator', 'GPM', 'Head', 'Top Management'].includes(activeRole);
  const visibleRecognitions = historyExpanded
    ? controller.ownRecognitions
    : controller.ownRecognitions.slice(0, 2);
  const name = (id: string) => snapshot!.employees.find((item) => item.id === id)?.name ?? 'Unknown';
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Peer recognition"
        title="Make great work visible"
        description="Recognize an active Employee, Coordinator or GPM. Approved recognitions create one White Spark and a permanent achievement card."
      />
      <div className={styles.formLayout}>
        <form
          className={styles.panel}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void controller.submit().then((success) => {
              if (!success) focusFirstInvalid(form);
            });
          }}
          noValidate
        >
          <div className={styles.formIntro}>
            <span className={`${styles.largeIcon} ${styles.toneWhite}`}>
              <Sparkles size={22} />
            </span>
            <div>
              <h2>New recognition</h2>
              <p>All fields are required. The Head of Department reviews the contribution.</p>
            </div>
          </div>
          {controller.message && (
            <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>
          )}
          <div className={styles.fieldGrid}>
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>
                Recipient <b aria-hidden="true">*</b>
              </span>
              <SelectField
                value={controller.form.recipientId}
                required
                onChange={(value) => controller.setField('recipientId', value)}
                options={[
                  { value: '', label: 'Select colleague' },
                  ...controller.recipients.map((employee) => ({
                    value: employee.id,
                    label: `${employee.name} · ${employee.title}`,
                  })),
                ]}
                ariaLabel="Recognition recipient"
                ariaInvalid={Boolean(controller.errors.recipientId)}
                ariaDescribedBy={controller.errors.recipientId ? 'recipient-error' : undefined}
              />
              {controller.errors.recipientId && (
                <small id="recipient-error" className={styles.fieldError}>
                  {controller.errors.recipientId}
                </small>
              )}
            </label>
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>
                Category <b aria-hidden="true">*</b>
              </span>
              <SelectField
                value={controller.form.category}
                required
                onChange={(value) => controller.setField('category', value)}
                options={[
                  { value: '', label: 'Select the behaviour to recognize' },
                  ...controller.categories.map((category) => ({ value: category, label: category })),
                ]}
                ariaLabel="Recognition category"
                ariaInvalid={Boolean(controller.errors.category)}
                ariaDescribedBy={controller.errors.category ? 'category-error' : undefined}
              />
              {controller.errors.category && (
                <small id="category-error" className={styles.fieldError}>
                  {controller.errors.category}
                </small>
              )}
            </label>
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>
                Reason / description <b aria-hidden="true">*</b>
              </span>
              <textarea
                rows={5}
                value={controller.form.description}
                required
                onChange={(event) => controller.setField('description', event.target.value)}
                placeholder="Describe the contribution, context and impact…"
                aria-invalid={Boolean(controller.errors.description)}
                aria-describedby={controller.errors.description ? 'description-error' : 'description-help'}
              />
              <small id="description-help">
                Example: “Created a deployment checklist that reduced handover errors and saved the project team
                two hours per release.”
              </small>
              {controller.errors.description && (
                <small id="description-error" className={styles.fieldError}>
                  {controller.errors.description}
                </small>
              )}
            </label>
          </div>
          <div className={styles.formFooter}>
            <p>
              <Clock3 size={15} /> Creates a pending approval request
            </p>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={controller.submitting || remaining === 0}
            >
              {controller.submitting ? <span className={styles.spinner} /> : <Send size={16} />}
              {controller.submitting ? 'Sending…' : 'Send recognition'}
            </button>
          </div>
        </form>
        <aside className={styles.sideStack}>
          <section className={`${styles.panel} ${styles.quotaPanel}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>{snapshot!.settings.currentQuarter} allocation</p>
                <h2>
                  {remaining} nomination{remaining === 1 ? '' : 's'} available
                </h2>
              </div>
              <Users size={21} />
            </div>
            <div className={styles.quotaDots}>
              {Array.from({ length: controller.quota }).map((_, index) => (
                <span className={index < controller.usedCount ? styles.quotaUsed : ''} key={index}>
                  {index < controller.usedCount ? <Clock3 size={13} /> : index + 1}
                </span>
              ))}
            </div>
            <p>
              Pending requests reserve a nomination; rejection makes it available again. Unused nominations
              never roll over to the next quarter.
            </p>
            <p className={styles.quotaDeadline}>
              <CalendarClock size={16} /> Use this allocation by{' '}
              <strong>{quarterEndLabel(snapshot!.settings.currentQuarter)}</strong>.
            </p>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Your requests</p>
                <h2>Recognition status</h2>
              </div>
              <RotateCcw size={19} />
            </div>
            {controller.ownRecognitions.length === 0 ? (
              <EmptyState
                title="No requests yet"
                description="Your sent nominations and their decisions will appear here."
              />
            ) : (
              <div className={styles.requestList}>
                {visibleRecognitions.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{name(item.recipientId)}</strong>
                      <p>
                        {item.category} · {formatDate(item.createdAt)}
                      </p>
                      {item.rejectionReason && <small>{item.rejectionReason}</small>}
                    </div>
                    <StatusBadge status={item.status} />
                  </article>
                ))}
                {canExpandHistory && controller.ownRecognitions.length > 2 && (
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-expanded={historyExpanded}
                    onClick={() => setHistoryExpanded((value) => !value)}
                  >
                    {historyExpanded ? 'Show less' : `See more (${controller.ownRecognitions.length - 2})`}
                  </button>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </PageTransition>
  );
}
