import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RewardFulfillment } from '@/models/shop';
import { fulfillmentService } from '@/services/fulfillmentService';

type FeedbackMessage = { tone: 'success' | 'error'; text: string };

export function useFulfillmentController() {
  const [items, setItems] = useState<RewardFulfillment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<FeedbackMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const page = await fulfillmentService.list();
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load reward fulfillment.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.employeeName} ${item.rewardKind} ${item.contactName} ${item.officeName ?? ''} ${item.status}`
        .toLowerCase().includes(normalized));
  }, [items, query]);

  const update = async (item: RewardFulfillment, status: RewardFulfillment['status'], notes: string) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      await fulfillmentService.update(item.id, status, notes);
      await load();
      setMessage({ tone: 'success', text: 'Reward fulfillment status updated.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update fulfillment.' });
    } finally {
      setBusyId(null);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fulfillmentService.list(nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load more requests.' });
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    visibleItems,
    loading,
    loadingMore,
    busyId,
    query,
    setQuery,
    message,
    hasNext,
    update,
    loadMore,
  };
}
