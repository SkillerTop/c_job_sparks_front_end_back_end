import type {
  TaskBoardApprovalSession,
  TaskBoardDraft,
  TaskBoardEvent,
  TaskBoardFilter,
  TaskBoardItem,
  TaskBoardPage,
} from '@/models/taskBoard';
import { apiRequest, createIdempotencyKey } from './apiClient';

const mutation = <T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
  apiRequest<T>(path, {
    method,
    idempotencyKey: createIdempotencyKey(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const taskBoardService = {
  list(filter: TaskBoardFilter, cursor?: string | null) {
    const query = new URLSearchParams({ filter, limit: '24' });
    if (cursor) query.set('cursor', cursor);
    return apiRequest<TaskBoardPage>(`/api/v1/task-board?${query}`);
  },
  startApproval(draft: TaskBoardDraft, taskId: string | null) {
    return mutation<TaskBoardApprovalSession>('/api/v1/task-board/approval-sessions', 'POST', { draft, taskId });
  },
  confirmFirst(id: string) {
    return mutation<TaskBoardApprovalSession>(
      `/api/v1/task-board/approval-sessions/${encodeURIComponent(id)}/confirm-first`, 'POST', {},
    );
  },
  confirmSecond(id: string) {
    return mutation<TaskBoardApprovalSession>(
      `/api/v1/task-board/approval-sessions/${encodeURIComponent(id)}/confirm-second`, 'POST', {},
    );
  },
  create(draft: TaskBoardDraft, approvalSessionId: string) {
    return mutation<TaskBoardItem>('/api/v1/task-board', 'POST', { draft, approvalSessionId });
  },
  update(id: string, draft: TaskBoardDraft, approvalSessionId: string | null) {
    return mutation<TaskBoardItem>(`/api/v1/task-board/${encodeURIComponent(id)}`, 'PATCH', { draft, approvalSessionId });
  },
  book(id: string) {
    return mutation<TaskBoardItem>(`/api/v1/task-board/${encodeURIComponent(id)}/book`, 'POST', {});
  },
  unassign(id: string, reason: string | null) {
    return mutation<TaskBoardItem>(`/api/v1/task-board/${encodeURIComponent(id)}/unassign`, 'POST', { reason });
  },
  complete(id: string) {
    return mutation<TaskBoardItem>(`/api/v1/task-board/${encodeURIComponent(id)}/complete`, 'POST', {});
  },
  remove(id: string) {
    return mutation<TaskBoardItem | { id: string; deleted: true }>(
      `/api/v1/task-board/${encodeURIComponent(id)}`, 'DELETE',
    );
  },
  history(id: string) {
    return apiRequest<TaskBoardEvent[]>(`/api/v1/task-board/${encodeURIComponent(id)}/history`);
  },
};
