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
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { formatDate } from '@/utils/formatters';
import { focusFirstInvalid } from '@/utils/accessibility';
import { quarterEndLabel } from '@/utils/quarter';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function RecognitionPage() {
  const { localize } = useUserPreferences();
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
        description="Recognize an active Employee, Coordinator or GPM. The selected category controls the White Spark amount; approval also creates a permanent achievement card."
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
              <h2><LocalizedText>New recognition</LocalizedText></h2>
              <p><LocalizedText>All fields are required. The Head of Department reviews the contribution.</LocalizedText></p>
            </div>
          </div>
          {controller.message && (
            <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>
          )}
          <div className={styles.fieldGrid}>
            <label className={`${styles.formField} ${styles.fieldFull}`}>
              <span>
                <LocalizedText>Recipient </LocalizedText><b aria-hidden="true">*</b>
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
                <LocalizedText>Category </LocalizedText><b aria-hidden="true">*</b>
              </span>
              <SelectField
                value={controller.form.category}
                required
                onChange={(value) => controller.setField('category', value)}
                options={[
                  { value: '', label: 'Select the behaviour to recognize' },
                  ...controller.categories.map((category) => ({
                    value: category.name,
                    label: `${category.name} · +${category.amount} White`,
                  })),
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
                <LocalizedText>Reason / description </LocalizedText><b aria-hidden="true">*</b>
              </span>
              <textarea
                rows={5}
                value={controller.form.description}
                required
                onChange={(event) => controller.setField('description', event.target.value)}
                placeholder={localize('Describe the contribution, context and impact…')}
                aria-invalid={Boolean(controller.errors.description)}
                aria-describedby={controller.errors.description ? 'description-error' : 'description-help'}
              />
              <small id="description-help">
                <LocalizedText>Example: “Created a deployment checklist that reduced handover errors and saved the project team
                two hours per release.”
              </LocalizedText></small>
              {controller.errors.description && (
                <small id="description-error" className={styles.fieldError}>
                  {controller.errors.description}
                </small>
              )}
            </label>
          </div>
          <div className={styles.formFooter}>
            <p>
              <Clock3 size={15} /> <LocalizedText>Creates a pending approval request
            </LocalizedText></p>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={controller.submitting || remaining === 0}
            >
              {controller.submitting ? <span className={styles.spinner} /> : <Send size={16} />}
              <LocalizedText>{controller.submitting ? 'Sending…' : 'Send recognition'}</LocalizedText>
            </button>
          </div>
        </form>
        <aside className={styles.sideStack}>
          <section className={`${styles.panel} ${styles.quotaPanel}`}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>{snapshot!.settings.currentQuarter} <LocalizedText>allocation</LocalizedText></p>
                <h2>
                  <LocalizedText>{`${remaining} ${remaining === 1 ? 'nomination' : 'nominations'} available`}</LocalizedText>
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
              <LocalizedText>Pending requests reserve a nomination; rejection makes it available again. Unused nominations
              never roll over to the next quarter.
            </LocalizedText></p>
            <p className={styles.quotaDeadline}>
              <CalendarClock size={16} /> <LocalizedText>Use this allocation by</LocalizedText>{' '}
              <strong>{quarterEndLabel(snapshot!.settings.currentQuarter)}</strong>.
            </p>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>Your requests</LocalizedText></p>
                <h2><LocalizedText>Recognition status</LocalizedText></h2>
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
                        {item.category} · +{item.amount} White · {formatDate(item.createdAt)}
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
                    <LocalizedText>{historyExpanded ? 'Show less' : `See more (${controller.ownRecognitions.length - 2})`}</LocalizedText>
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
