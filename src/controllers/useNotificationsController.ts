import { useCallback, useEffect, useMemo, useState } from 'react';
import { notificationService, type AppNotification } from '@/services/notificationService';

export function useNotificationsController() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const load = useCallback(async () => {
    try { setItems((await notificationService.list()).items); }
    catch { /* Shell notifications must never make the workspace unavailable. */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);
  const markAllRead = async () => {
    if (!unread) return;
    try {
      await notificationService.markAllRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }));
    } catch { /* Users can retry by opening the panel again. */ }
  };
  return { items, unread, markAllRead, reload: load };
}
