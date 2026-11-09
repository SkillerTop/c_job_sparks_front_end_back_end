import { apiRequest, createIdempotencyKey } from './apiClient';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  text: string;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  hasNext: boolean;
}

export const notificationService = {
  list: () => apiRequest<NotificationPage>('/api/v1/me/notifications?limit=50'),
  markAllRead: () => apiRequest<{ updated: true }>('/api/v1/me/notifications/read-all', {
    method: 'POST', idempotencyKey: createIdempotencyKey(),
  }),
};
