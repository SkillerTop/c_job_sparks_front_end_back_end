import { CalendarClock, CheckCircle2, ClipboardList, History, Pencil, Plus, RefreshCcw, ShieldCheck, Trash2, UserRound, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTaskBoardController } from '@/controllers/useTaskBoardController';
import type { TaskBoardApprovalSession, TaskBoardDraft, TaskBoardFilter, TaskBoardItem } from '@/models/taskBoard';
import type { SpendableSparkType } from '@/models/shop';
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

const displayDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

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

  const openCreate = () => { setEditing(null); setDraft(blankDraft); setFormOpen(true); };
  const openEdit = (item: TaskBoardItem) => {
    setEditing(item);
    setDraft({ title: item.title, description: item.description, rewardComponents: item.rewardComponents, dueDate: item.dueDate });
    setFormOpen(true);
  };
  const closeApproval = () => { setApproval(null); setApprovalStage(null); };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.rewardComponents.length === 0) { setRewardError(true); return; }
    setRewardError(false);
    const rewardChanged = !editing || JSON.stringify(editing.rewardComponents) !== JSON.stringify(draft.rewardComponents);
    if (!rewardChanged && editing) {
      try { await controller.update(draft, editing); setFormOpen(false); }
      catch { /* Feedback is rendered by the controller. */ }
      return;
    }
    try {
      const session = await controller.startApproval(draft, editing?.id ?? null);
      setApproval(session);
      setApprovalStage('first');
    } catch { /* Feedback is rendered by the controller. */ }
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
    if (!approval) return;
    try { setApproval(await controller.confirmFirst(approval)); setApprovalStage('second'); }
    catch { closeApproval(); }
  };
  const publish = async () => {
    if (!approval) return;
    try {
      const ready = await controller.confirmSecond(approval);
      await controller.publish(draft, ready, editing);
      closeApproval(); setFormOpen(false);
    } catch { closeApproval(); }
  };

  const executeConfirmed = async () => {
    if (!confirming) return;
    try {
      if (confirming.action === 'book') await controller.book(confirming.item);
      if (confirming.action === 'unassign') await controller.unassign(confirming.item, reason.trim() || null);
      if (confirming.action === 'complete') await controller.complete(confirming.item);
      if (confirming.action === 'remove') await controller.remove(confirming.item);
      setConfirming(null); setReason('');
    } catch { /* Keep the dialog open so the error remains recoverable. */ }
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
                  {item.permissions.canBook && <button className={appStyles.accentButton} type="button" onClick={() => setConfirming({ action: 'book', item })}><ClipboardList size={16} /> <LocalizedText>Take task</LocalizedText></button>}
                  {item.permissions.canEdit && <button className={appStyles.secondaryButton} type="button" onClick={() => openEdit(item)}><Pencil size={16} /> <LocalizedText>Edit</LocalizedText></button>}
                  {item.permissions.canUnassign && <button className={appStyles.secondaryButton} type="button" onClick={() => setConfirming({ action: 'unassign', item })}><UserMinus size={16} /> <LocalizedText>Unassign employee</LocalizedText></button>}
                  {item.permissions.canComplete && <button className={appStyles.approveButton} type="button" onClick={() => setConfirming({ action: 'complete', item })}><CheckCircle2 size={16} /> <LocalizedText>Completed</LocalizedText></button>}
                  {item.permissions.canViewHistory && <button className={appStyles.secondaryButton} type="button" onClick={() => void controller.showHistory(item)}><History size={16} /> <LocalizedText>History</LocalizedText></button>}
                  {item.permissions.canCancel && <button className={appStyles.dangerGhost} type="button" onClick={() => setConfirming({ action: 'remove', item })}><Trash2 size={16} /> <LocalizedText>{item.status === 'Completed' ? 'Delete' : 'Cancel task'}</LocalizedText></button>}
                </div>
              </article>
            ))}
          </section>}
        {controller.hasNext && <button type="button" className={`${appStyles.secondaryButton} ${styles.loadMore}`} disabled={controller.loadingMore} onClick={() => void controller.loadMore()}><RefreshCcw size={16} /> <LocalizedText>{controller.loadingMore ? 'Loading…' : 'Load more tasks'}</LocalizedText></button>}
      </div>

      <Modal open={formOpen} title={editing ? 'Edit task' : 'Publish a task'} description="All fields marked with an asterisk are required." onClose={() => setFormOpen(false)}>
        <form className={styles.form} onSubmit={(event) => void submitForm(event)}>
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
          <div className={`${appStyles.formFooter} ${styles.formFooter}`}><p><ShieldCheck size={15} /> <LocalizedText>Reward approval is confirmed in two steps before publication.</LocalizedText></p><div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} onClick={() => setFormOpen(false)}><LocalizedText>Cancel</LocalizedText></button><button type="submit" className={appStyles.accentButton} disabled={controller.busy}><LocalizedText>{editing ? 'Save changes' : 'Continue to approval'}</LocalizedText></button></div></div>
        </form>
      </Modal>

      <Modal open={approvalStage === 'first'} title="Reward approval required" dismissible onClose={closeApproval}>
        <p className={styles.warning}><LocalizedText>ATTENTION! The reward for every Task Board task must be agreed with Top Management in advance. Are you sure the reward has been agreed?</LocalizedText></p>
        <div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} onClick={closeApproval}><LocalizedText>No</LocalizedText></button><button type="button" className={appStyles.accentButton} onClick={() => void approveFirst()}><LocalizedText>Yes, agreed</LocalizedText></button></div>
      </Modal>
      <Modal open={approvalStage === 'second'} title="Final confirmation" dismissible onClose={closeApproval}>
        <p className={styles.warning}><LocalizedText>Has the task definitely, definitely been agreed with the directors?</LocalizedText></p>
        <div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} onClick={() => setApprovalStage('first')}><LocalizedText>No, go back</LocalizedText></button><button type="button" className={appStyles.accentButton} onClick={() => void publish()}><LocalizedText>Yes, publish</LocalizedText></button></div>
      </Modal>

      <Modal open={Boolean(confirming)} title={confirming?.action === 'book' ? 'Book task' : confirming?.action === 'unassign' ? 'Unassign employee' : confirming?.action === 'complete' ? 'Confirm completion' : 'Remove task'} onClose={() => setConfirming(null)}>
        {confirming?.action === 'book' && <p><LocalizedText>Do you want to book this task for yourself?</LocalizedText></p>}
        {confirming?.action === 'unassign' && <><p><LocalizedText>Are you sure you want to unassign the employee? The task will become available to other employees again.</LocalizedText></p><label className={styles.form}><span><LocalizedText>Reason (optional)</LocalizedText></span><textarea maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label></>}
        {confirming?.action === 'complete' && <p><LocalizedText>Confirm task completion and credit</LocalizedText>{' '}<SparkPrice components={confirming.item.rewardComponents} />{' '}<LocalizedText>to</LocalizedText> {confirming.item.assigneeName}?</p>}
        {confirming?.action === 'remove' && <p><LocalizedText>{confirming.item.status === 'Completed' ? 'Delete this completed task from the board? Its Ledger reward will be preserved.' : 'Cancel this task? It will no longer be available for booking.'}</LocalizedText></p>}
        <div className={styles.modalActions}><button type="button" className={appStyles.secondaryButton} onClick={() => setConfirming(null)}><LocalizedText>Cancel</LocalizedText></button><button type="button" className={confirming?.action === 'remove' ? appStyles.dangerGhost : appStyles.accentButton} disabled={controller.busy} onClick={() => void executeConfirmed()}><LocalizedText>Confirm</LocalizedText></button></div>
      </Modal>

      <Modal open={Boolean(controller.history)} title="Task history" onClose={controller.clearHistory}>
        <div className={styles.history}>{controller.history?.map((event) => <article key={event.id}><strong>{event.eventType}</strong><small>{event.actorName} · {displayDate(event.occurredAt)}</small></article>)}</div>
      </Modal>
    </PageTransition>
  );
}
