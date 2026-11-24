import { useMemo, useState } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import { selectApprovalQueue, type ApprovalQueueItem } from '@/models/selectors';

export type QueueItem = ApprovalQueueItem;

export function useApprovalController() {
  const { snapshot, currentUserId, reviewRecognition, reviewAward } = useSpark();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const queue = useMemo<QueueItem[]>(() => {
    if (!snapshot) return [];
    return selectApprovalQueue(snapshot, currentUserId);
  }, [snapshot, currentUserId]);

  const review = async (item: QueueItem, decision: 'Approved' | 'Rejected', reason = '') => {
    setProcessingId(item.id);
    setMessage(null);
    try {
      if (item.kind === 'Recognition') await reviewRecognition(item.id, decision, reason);
      else await reviewAward(item.id, decision, reason);
      setMessage({ tone: 'success', text: `${item.kind} ${decision.toLowerCase()}.` });
      return true;
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not update this request.',
      });
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  return { queue, processingId, message, review };
}
