import { useMemo, useState } from 'react';
import { useSpark } from './SparkContext';
import { selectPendingRequests } from '@/models/selectors';

export type QueueItem = {
  id: string;
  kind: 'Recognition' | 'Yellow Award';
  employeeId: string;
  awardedBy: string;
  category: string;
  description: string;
  amount: number;
  createdAt: string;
};

export function useApprovalController() {
  const { snapshot, currentUserId, reviewRecognition, reviewAward } = useSpark();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const queue = useMemo<QueueItem[]>(() => {
    if (!snapshot) return [];
    const pending = selectPendingRequests(snapshot, currentUserId, 'Head');
    const recognitions = pending.recognitions.map((item) => ({
      id: item.id,
      kind: 'Recognition' as const,
      employeeId: item.recipientId,
      awardedBy: item.senderId,
      category: item.category,
      description: item.description,
      amount: 1,
      createdAt: item.createdAt,
    }));
    const awards = pending.awards.map((item) => ({
      id: item.id,
      kind: 'Yellow Award' as const,
      employeeId: item.employeeId,
      awardedBy: item.awardedBy,
      category: item.category,
      description: item.description,
      amount: item.amount,
      createdAt: item.createdAt,
    }));
    return [...recognitions, ...awards].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
