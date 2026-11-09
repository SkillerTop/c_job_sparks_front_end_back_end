import { AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, ClipboardList, History, Info, Pencil, Plus, RefreshCcw, ShieldCheck, Trash2, UserRound, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTaskBoardController } from '@/controllers/useTaskBoardController';
import type { TaskBoardApprovalSession, TaskBoardDraft, TaskBoardFilter, TaskBoardItem } from '@/models/taskBoard';
import type { SparkPriceComponent, SpendableSparkType } from '@/models/shop';
import { SPENDABLE_SPARK_TYPES } from '@/utils/shop';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SparkPrice } from '@/views/components/shop/SparkPrice';
import appStyles from '@/views/styles/app.module.css';
import styles from '@/views/styles/taskBoard.module.css';

const blankDraft: TaskBoardDraft = { title: '', description: '', rewardComponents: [{ sparkType: 'White', amount: 1 }], dueDate: null };
const filters: Array<{ value: TaskBoardFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' },
  { value: 'booked', label: 'Booked' }, { value: 'completed', label: 'Completed' },
  { value: 'mine', label: 'Created by me' }, { value: 'assigned', label: 'Booked by me' },
];
const statusLabel: Record<TaskBoardItem['status'], string> = {
  Active: 'Active', Booked: 'Booked', Completed: 'Completed', Cancelled: 'Cancelled',
};
const cardTone: Record<TaskBoardItem['status'], string> = {
  Active: styles.active, Booked: styles.booked, Completed: styles.completed, Cancelled: styles.cancelled,
};
const eventLabel: Record<string, string> = {
  Created: 'Task created', ApprovalFirstConfirmed: 'First approval confirmed',
  ApprovalSecondConfirmed: 'Final approval confirmed', Updated: 'Task updated',
  Booked: 'Task booked', AssigneeDetached: 'Employee unassigned', Completed: 'Task completed',
  RewardCredited: 'Reward credited', Cancelled: 'Task cancelled', Deleted: 'Task deleted',
};

const displayDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
const displayDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The operation could not be completed.';

function TaskDialogSummary({
  title,
  rewardComponents,
  assigneeName,
}: {
  title: string;
  rewardComponents: SparkPriceComponent[];
  assigneeName?: string | null;
}) {
  return (
    <section className={styles.dialogSummary}>
      <div className={styles.dialogSummaryTitle}>
        <span className={styles.taskIcon}><ClipboardList size={18} /></span>
        <div><small><LocalizedText>Task summary</LocalizedText></small><strong>{title}</strong></div>
      </div>
      <div className={styles.dialogSummaryReward}><span><LocalizedText>Reward</LocalizedText></span><SparkPrice components={rewardComponents} /></div>
      {assigneeName && <div className={styles.dialogSummaryAssignee}><UserRound size={15} /><span><LocalizedText>Assigned employee</LocalizedText>:</span><strong>{assigneeName}</strong></div>}
    </section>
  );
}

export function TaskBoardPage() {
  const controller = useTaskBoardController();
  const [editing, setEditing] = useState<TaskBoardItem | null>(null);
  const [draft, setDraft] = useState<TaskBoardDraft>(blankDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [approval, setApproval] = useState<TaskBoardApprovalSession | null>(null);
  const [approvalStage, setApprovalStage] = useState<null | 'first' | 'second'>(null);
  const [confirming, setConfirming] = useState<{ action: 'book' | 'unassign' | 'complete' | 'remove'; item: TaskBoardItem } | null>(null);
  const [reason, setReason] = useState('');
  const [rewardError, setRewardError] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const openCreate = () => { setEditing(null); setDraft(blankDraft); setDialogError(null); setFormOpen(true); };
  const openEdit = (item: TaskBoardItem) => {
    setEditing(item);
    setDraft({ title: item.title, description: item.description, rewardComponents: item.rewardComponents, dueDate: item.dueDate });
    setDialogError(null);
    setFormOpen(true);
  };
  const closeApproval = () => {
    if (dialogBusy) return;
    setApproval(null);
    setApprovalStage(null);
    setDialogError(null);
    setFormOpen(true);
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.rewardComponents.length === 0) { setRewardError(true); return; }
    setRewardError(false);
    setDialogError(null);
    const rewardChanged = !editing || JSON.stringify(editing.rewardComponents) !== JSON.stringify(draft.rewardComponents);
    if (!rewardChanged && editing) {
      try { await controller.update(draft, editing); setFormOpen(false); }
      catch (error) { setDialogError(errorMessage(error)); }
      return;
    }
    setDialogBusy(true);
    try {
      const session = await controller.startApproval(draft, editing?.id ?? null);
      setFormOpen(false);
      setApproval(session);
      setApprovalStage('first');
    } catch (error) { setDialogError(errorMessage(error)); }
    finally { setDialogBusy(false); }
  };

  const updateRewardComponent = (sparkType: SpendableSparkType, rawValue: string) => {
    const amount = rawValue === '' ? 0 : Number(rawValue);
    setDraft((current) => ({
      ...current,
      rewardComponents: SPENDABLE_SPARK_TYPES.map((type) => ({
        sparkType: type,
        amount: type === sparkType
          ? amount
          : (current.rewardComponents.find((component) => component.sparkType === type)?.amount ?? 0),
      })).filter((component) => Number.isSafeInteger(component.amount) && component.amount > 0),
    }));
    setRewardError(false);
  };

  const approveFirst = async () => {
    if (!approval || dialogBusy) return;
    setDialogError(null);
    setDialogBusy(true);
    try { setApproval(await controller.confirmFirst(approval)); setApprovalStage('second'); }
    catch (error) { setDialogError(errorMessage(error)); }
    finally { setDialogBusy(false); }
  };
  const publish = async () => {
    if (!approval || dialogBusy) return;
    setDialogError(null);
    setDialogBusy(true);
    try {
      const ready = await controller.confirmSecond(approval);
      await controller.publish(draft, ready, editing);
      setApproval(null); setApprovalStage(null); setFormOpen(false);
    } catch (error) { setDialogError(errorMessage(error)); }
    finally { setDialogBusy(false); }
  };

  const executeConfirmed = async () => {
    if (!confirming || dialogBusy) return;
    setDialogError(null);
    setDialogBusy(true);
    try {
      if (confirming.action === 'book') await controller.book(confirming.item);
      if (confirming.action === 'unassign') await controller.unassign(confirming.item, reason.trim() || null);
      if (confirming.action === 'complete') await controller.complete(confirming.item);
      if (confirming.action === 'remove') await controller.remove(confirming.item);
      setConfirming(null); setReason('');
    } catch (error) { setDialogError(errorMessage(error)); }
    finally { setDialogBusy(false); }
  };

  return (
    <PageTransition>
      <div className={styles.page}>
        <PageHeader eyebrow="Employee opportunities" title="Task Board"
          description="Book an available task and earn the published Spark reward after the author confirms completion."
          action={controller.canCreate ? (
            <button type="button" className={appStyles.accentButton} onClick={openCreate}><Plus size={17} /> <LocalizedText>Publish task</LocalizedText></button>
          ) : undefined} />
        {controller.message && <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>}
        <section className={`${appStyles.panel} ${styles.filterPanel}`} aria-label="Task Board filters">
          <div className={styles.filterIntro}>
            <div><p className={appStyles.eyebrow}><LocalizedText>Task Board</LocalizedText></p><h2><LocalizedText>Browse tasks</LocalizedText></h2></div>
            <span className={appStyles.subtlePill}>{controller.items.length} <LocalizedText>tasks</LocalizedText></span>
          </div>
          <div className={appStyles.segmented} role="group" aria-label="Task Board filters">
            {filters.map((item) => <button type="button" key={item.value}
              className={controller.filter === item.value ? appStyles.segmentActive : undefined}
              aria-pressed={controller.filter === item.value} onClick={() => controller.setFilter(item.value)}>
              <LocalizedText>{item.label}</LocalizedText>
            </button>)}
          </div>
        </section>
        {controller.loading ? <div className={`${appStyles.panel} ${styles.boardState}`} role="status"><RefreshCcw className={styles.spinner} size={20} /><LocalizedText>Loading Task Board…</LocalizedText></div>
          : controller.items.length === 0 ? <EmptyState title="No tasks in this view" description="Choose another filter or publish a new task." />
          : <section className={styles.grid} aria-label="Task Board items">
            {controller.items.map((item) => (
              <article key={item.id} className={`${appStyles.panel} ${styles.card} ${cardTone[item.status]}`}>
                <div className={styles.cardTop}><span className={styles.taskIcon}><ClipboardList size={19} /></span><StatusBadge status={statusLabel[item.status]} className={styles[`status${item.status}`]} /></div>
                <h2>{item.title}</h2>
                <p className={styles.description}>{item.description}</p>
                <div className={styles.rewardBlock}><span><LocalizedText>Reward</LocalizedText></span><SparkPrice components={item.rewardComponents} /></div>
                <dl className={styles.metaGrid}>
                  <div><dt><UserRound size={14} /> <LocalizedText>Author</LocalizedText></dt><dd>{item.authorName}</dd></div>
                  <div><dt><ShieldCheck size={14} /> <LocalizedText>Department</LocalizedText></dt><dd>{item.authorDepartmentName}</dd></div>
                  <div><dt><CalendarClock size={14} /> <LocalizedText>Published</LocalizedText></dt><dd>{displayDate(item.createdAt)}</dd></div>
                  {item.dueDate && <div><dt><CalendarClock size={14} /> <LocalizedText>Due</LocalizedText></dt><dd>{displayDate(item.dueDate)}</dd></div>}
                </dl>
                {item.assigneeName && <div className={styles.assignee}><UserRound size={16} /><span><LocalizedText>Assigned employee</LocalizedText></span><strong>{item.assigneeName}</strong></div>}
                <div className={styles.actions}>
                  {item.permissions.canBook && <button className={appStyles.accentButton} type="button" onClick={() => { setDialogError(null); setConfirming({ action: 'book', item }); }}><ClipboardList size={16} /> <LocalizedText>Take task</LocalizedText></button>}
                  {item.permissions.canEdit && <button className={appStyles.secondaryButton} type="button" onClick={() => openEdit(item)}><Pencil size={16} /> <LocalizedText>Edit</LocalizedText></button>}
                  {item.permissions.canUnassign && <button className={appStyles.secondaryButton} type="button" onClick={() => { setDialogError(null); setConfirming({ action: 'unassign', item }); }}><UserMinus size={16} /> <LocalizedText>Unassign employee</LocalizedText></button>}
                  {item.permissions.canComplete && <button className={appStyles.approveButton} type="button" onClick={() => { setDialogError(null); setConfirming({ action: 'complete', item }); }}><CheckCircle2 size={16} /> <LocalizedText>Completed</LocalizedText></button>}
                  {item.permissions.canViewHistory && <button className={appStyles.secondaryButton} type="button" onClick={() => void controller.showHistory(item)}><History size={16} /> <LocalizedText>History</LocalizedText></button>}
                  {item.permissions.canCancel && <button className={appStyles.dangerGhost} type="button" onClick={() => { setDialogError(null); setConfirming({ action: 'remove', item }); }}><Trash2 size={16} /> <LocalizedText>{item.status === 'Completed' ? 'Delete' : 'Cancel task'}</LocalizedText></button>}
                </div>
              </article>
            ))}
          </section>}
        {controller.hasNext && <button type="button" className={`${appStyles.secondaryButton} ${styles.loadMore}`} disabled={controller.loadingMore} onClick={() => void controller.loadMore()}><RefreshCcw size={16} /> <LocalizedText>{controller.loadingMore ? 'Loading…' : 'Load more tasks'}</LocalizedText></button>}
      </div>

      <Modal open={formOpen} title={editing ? 'Edit task' : 'Publish a task'} description="All fields marked with an asterisk are required." dismissible={!dialogBusy} onClose={() => !dialogBusy && setFormOpen(false)}>
        <form className={styles.form} onSubmit={(event) => void submitForm(event)}>
          {dialogError && <Feedback tone="error">{dialogError}</Feedback>}
          <div className={appStyles.formIntro}><span className={`${appStyles.largeIcon} ${styles.formIcon}`}><ClipboardList size={21} /></span><div><h2><LocalizedText>Task details</LocalizedText></h2><p><LocalizedText>Describe the work, choose the reward and set an optional deadline.</LocalizedText></p></div></div>
          <div className={appStyles.fieldGrid}>
          <label className={`${appStyles.formField} ${appStyles.fieldFull}`}><span><LocalizedText>Task title</LocalizedText> <b>*</b></span><input required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className={`${appStyles.formField} ${appStyles.fieldFull}`}><span><LocalizedText>Task description</LocalizedText> <b>*</b></span><textarea required maxLength={10000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <fieldset className={`${appStyles.formField} ${appStyles.fieldFull} ${styles.rewardComposer}`} aria-describedby={rewardError ? 'task-reward-error' : undefined}>
            <legend><LocalizedText>Reward in Sparks</LocalizedText> *</legend>
            <small><LocalizedText>Use one or combine several Spark types. Leave unused types empty.</LocalizedText></small>
            <div>{SPENDABLE_SPARK_TYPES.map((sparkType) => <label key={sparkType}>
              <span><SparkIcon type={sparkType} size={17} animated={false} /> {sparkType}</span>
              <input type="number" min={1} max={1000000} step={1} inputMode="numeric" placeholder="0"
                value={draft.rewardComponents.find((component) => component.sparkType === sparkType)?.amount || ''}
                onChange={(event) => updateRewardComponent(sparkType, event.target.value)}
                aria-label={`${sparkType} Spark reward`} />
            </label>)}</div>
            {rewardError && <small id="task-reward-error" role="alert"><LocalizedText>Choose at least one Spark type and amount.</LocalizedText></small>}
          </fieldset>
          <label className={`${appStyles.formField} ${appStyles.fieldFull}`}><span><LocalizedText>Due date (optional)</LocalizedText></span><input type="date" value={draft.dueDate ?? ''} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></label>
          </div>
          <div className={`${appStyles.formFooter} ${styles.formFooter}`}><p><ShieldCheck size={15} /> <LocalizedText>Reward approval is confirmed in two steps before publication.</LocalizedText></p><div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} disabled={dialogBusy} onClick={() => setFormOpen(false)}><LocalizedText>Cancel</LocalizedText></button><button type="submit" className={appStyles.accentButton} disabled={controller.busy || dialogBusy}>{dialogBusy && <RefreshCcw className={styles.spinner} size={16} />}<LocalizedText>{editing ? 'Save changes' : 'Continue to approval'}</LocalizedText></button></div></div>
        </form>
      </Modal>

      <Modal open={approvalStage === 'first'} title="Reward approval required" description="Step 1 of 2" dismissible={!dialogBusy} onClose={closeApproval}>
        <div className={styles.dialogBody}>
          {dialogError && <Feedback tone="error">{dialogError}</Feedback>}
          <aside className={`${styles.dialogNotice} ${styles.noticeWarning}`} role="note">
            <span><AlertTriangle size={20} /></span>
            <div><strong><LocalizedText>Management approval</LocalizedText></strong><p><LocalizedText>ATTENTION! The reward for every Task Board task must be agreed with Top Management in advance. Are you sure the reward has been agreed?</LocalizedText></p></div>
          </aside>
          <TaskDialogSummary title={draft.title} rewardComponents={draft.rewardComponents} />
          <div className={styles.approvalProgress} aria-label="Reward approval progress"><span className={styles.stepActive}>1</span><i /><span>2</span></div>
          <div className={styles.modalActions}>
            <button type="button" className={appStyles.secondaryButton} disabled={dialogBusy} onClick={closeApproval}><LocalizedText>No</LocalizedText></button>
            <button type="button" className={appStyles.accentButton} disabled={dialogBusy} onClick={() => void approveFirst()}>{dialogBusy ? <RefreshCcw className={styles.spinner} size={16} /> : <ShieldCheck size={16} />}<LocalizedText>Yes, agreed</LocalizedText></button>
          </div>
        </div>
      </Modal>
      <Modal open={approvalStage === 'second'} title="Final confirmation" description="Step 2 of 2" dismissible={!dialogBusy} onClose={closeApproval}>
        <div className={styles.dialogBody}>
          {dialogError && <Feedback tone="error">{dialogError}</Feedback>}
          <aside className={`${styles.dialogNotice} ${styles.noticeWarning}`} role="note">
            <span><BadgeCheck size={20} /></span>
            <div><strong><LocalizedText>Final publication check</LocalizedText></strong><p><LocalizedText>Has the task definitely, definitely been agreed with the directors?</LocalizedText></p></div>
          </aside>
          <TaskDialogSummary title={draft.title} rewardComponents={draft.rewardComponents} />
          <div className={styles.approvalProgress} aria-label="Reward approval progress"><span className={styles.stepComplete}>1</span><i className={styles.progressComplete} /><span className={styles.stepActive}>2</span></div>
          <div className={styles.modalActions}>
            <button type="button" className={appStyles.secondaryButton} disabled={dialogBusy} onClick={() => { setDialogError(null); setApprovalStage('first'); }}><LocalizedText>No, go back</LocalizedText></button>
            <button type="button" className={appStyles.accentButton} disabled={dialogBusy} onClick={() => void publish()}>{dialogBusy ? <RefreshCcw className={styles.spinner} size={16} /> : <BadgeCheck size={16} />}<LocalizedText>Yes, publish</LocalizedText></button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(confirming)} title={confirming?.action === 'book' ? 'Book task' : confirming?.action === 'unassign' ? 'Unassign employee' : confirming?.action === 'complete' ? 'Confirm completion' : 'Remove task'} description={confirming?.item.title} dismissible={!dialogBusy} onClose={() => !dialogBusy && setConfirming(null)}>
        {confirming && <div className={styles.dialogBody}>
          {dialogError && <Feedback tone="error">{dialogError}</Feedback>}
          <aside className={`${styles.dialogNotice} ${confirming.action === 'remove' || confirming.action === 'unassign' ? styles.noticeDanger : confirming.action === 'complete' ? styles.noticeSuccess : styles.noticeInfo}`} role={confirming.action === 'remove' ? 'alert' : 'note'}>
            <span>{confirming.action === 'book' ? <Info size={20} /> : confirming.action === 'unassign' ? <UserMinus size={20} /> : confirming.action === 'complete' ? <CheckCircle2 size={20} /> : <Trash2 size={20} />}</span>
            <div>
              <strong><LocalizedText>{confirming.action === 'book' ? 'Reserve this task?' : confirming.action === 'unassign' ? 'Release this task?' : confirming.action === 'complete' ? 'Credit the reward?' : 'Remove this task?'}</LocalizedText></strong>
              <p><LocalizedText>{confirming.action === 'book'
                ? 'Do you want to book this task for yourself?'
                : confirming.action === 'unassign'
                  ? 'Are you sure you want to unassign the employee? The task will become available to other employees again.'
                  : confirming.action === 'complete'
                    ? 'Confirm completion and credit the published reward to the assigned employee.'
                    : confirming.item.status === 'Completed'
                      ? 'Delete this completed task from the board? Its Ledger reward will be preserved.'
                      : 'Cancel this task? It will no longer be available for booking.'}</LocalizedText></p>
            </div>
          </aside>
          <TaskDialogSummary title={confirming.item.title} rewardComponents={confirming.item.rewardComponents} assigneeName={confirming.item.assigneeName} />
          {confirming.action === 'unassign' && <label className={appStyles.formField}><span><LocalizedText>Reason (optional)</LocalizedText></span><textarea maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
          <div className={styles.modalActions}>
            <button type="button" className={appStyles.secondaryButton} disabled={dialogBusy} onClick={() => setConfirming(null)}><LocalizedText>Cancel</LocalizedText></button>
            <button type="button" className={confirming.action === 'remove' ? appStyles.rejectButton : confirming.action === 'complete' ? appStyles.approveButton : appStyles.accentButton} disabled={dialogBusy || controller.busy} onClick={() => void executeConfirmed()}>{dialogBusy ? <RefreshCcw className={styles.spinner} size={16} /> : confirming.action === 'book' ? <ClipboardList size={16} /> : confirming.action === 'unassign' ? <UserMinus size={16} /> : confirming.action === 'complete' ? <CheckCircle2 size={16} /> : <Trash2 size={16} />}<LocalizedText>Confirm</LocalizedText></button>
          </div>
        </div>}
      </Modal>

      <Modal open={Boolean(controller.history)} title="Task history" description="Complete audit trail for this task." onClose={controller.clearHistory}>
        <div className={styles.dialogBody}>
          <div className={styles.historyHeader}><span className={`${appStyles.largeIcon} ${styles.formIcon}`}><History size={20} /></span><div><strong><LocalizedText>Recorded actions</LocalizedText></strong><small><LocalizedText>Entries in history</LocalizedText>: {controller.history?.length ?? 0}</small></div></div>
          <div className={styles.history} role="list">{controller.history?.map((event) => <article key={event.id} role="listitem"><span className={styles.historyDot} /><div><strong><LocalizedText>{eventLabel[event.eventType] ?? event.eventType}</LocalizedText></strong><p>{event.actorName}</p><time dateTime={event.occurredAt}>{displayDateTime(event.occurredAt)}</time>{typeof event.metadata.reason === 'string' && event.metadata.reason && <small><LocalizedText>Reason</LocalizedText>: {event.metadata.reason}</small>}</div></article>)}</div>
          <div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} onClick={controller.clearHistory}><LocalizedText>Close</LocalizedText></button></div>
        </div>
      </Modal>
    </PageTransition>
  );
}
