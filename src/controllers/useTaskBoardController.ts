import { useCallback, useEffect, useState } from 'react';
import type {
  TaskBoardApprovalSession,
  TaskBoardDraft,
  TaskBoardEvent,
  TaskBoardFilter,
  TaskBoardItem,
} from '@/models/taskBoard';
import { taskBoardService } from '@/services/taskBoardService';
import { useSpark } from './SparkContext';

type Message = { tone: 'success' | 'error'; text: string };

export function useTaskBoardController() {
  const { activeRole, currentUserId, refresh } = useSpark();
  const [items, setItems] = useState<TaskBoardItem[]>([]);
  const [filter, setFilter] = useState<TaskBoardFilter>('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [history, setHistory] = useState<TaskBoardEvent[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const page = await taskBoardService.list(filter);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load the Task Board.' });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const run = async <T,>(work: () => Promise<T>, success: string, refreshBalances = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await work();
      await load();
      if (refreshBalances) await refresh();
      setMessage({ tone: 'success', text: success });
      return result;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The operation could not be completed.' });
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await taskBoardService.list(filter, nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load more tasks.' });
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    items,
    filter,
    setFilter,
    loading,
    loadingMore,
    busy,
    message,
    hasNext,
    canCreate: ['Head', 'Top Management', 'Administrator'].includes(activeRole),
    isAdministrator: activeRole === 'Administrator',
    currentUserId,
    loadMore,
    startApproval: (draft: TaskBoardDraft, taskId: string | null) => taskBoardService.startApproval(draft, taskId),
    confirmFirst: (approval: TaskBoardApprovalSession) => taskBoardService.confirmFirst(approval.id),
    confirmSecond: (approval: TaskBoardApprovalSession) => taskBoardService.confirmSecond(approval.id),
    publish: (draft: TaskBoardDraft, approval: TaskBoardApprovalSession, editing: TaskBoardItem | null) =>
      run(
        () => editing
          ? taskBoardService.update(editing.id, draft, approval.id)
          : taskBoardService.create(draft, approval.id),
        editing ? 'Task updated and published.' : 'Task published.',
      ),
    update: (draft: TaskBoardDraft, editing: TaskBoardItem) =>
      run(() => taskBoardService.update(editing.id, draft, null), 'Task updated.'),
    book: (item: TaskBoardItem) => run(() => taskBoardService.book(item.id), 'The task is booked for you.'),
    unassign: (item: TaskBoardItem, reason: string | null) =>
      run(() => taskBoardService.unassign(item.id, reason), 'The employee was unassigned.'),
    complete: (item: TaskBoardItem) =>
      run(() => taskBoardService.complete(item.id), 'The task was completed and the reward was credited.', true),
    remove: (item: TaskBoardItem) =>
      run(() => taskBoardService.remove(item.id), item.status === 'Completed' ? 'Task deleted.' : 'Task cancelled.'),
    history,
    clearHistory: () => setHistory(null),
    showHistory: async (item: TaskBoardItem) => {
      setBusy(true);
      try { setHistory(await taskBoardService.history(item.id)); }
      catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load task history.' });
      } finally { setBusy(false); }
    },
  };
}
