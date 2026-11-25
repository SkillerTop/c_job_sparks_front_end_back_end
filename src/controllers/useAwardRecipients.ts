import { useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, Role } from '@/models';
import { selectAwardTargets } from '@/models/selectors';
import { apiRequest, isApiMode } from '@/services/apiClient';

export interface AwardRecipientOption {
  id: string;
  name: string;
  title: string;
}

interface EligibleRecipientResponse extends AwardRecipientOption {
  departmentId: string;
  departmentIds: string[];
  role: Role;
}

export const useAwardRecipients = (
  snapshot: AppSnapshot,
  actorId: string,
  role: Role,
): AwardRecipientOption[] => {
  const localRecipients = useMemo(
    () => selectAwardTargets(snapshot, actorId, role),
    [snapshot, actorId, role],
  );
  const [serverRecipients, setServerRecipients] = useState<EligibleRecipientResponse[] | null>(null);

  useEffect(() => {
    if (!isApiMode) return;
    let cancelled = false;
    setServerRecipients(null);
    void apiRequest<EligibleRecipientResponse[]>('/api/v1/eligible-recipients?purpose=award')
      .then((recipients) => {
        if (!cancelled) setServerRecipients(recipients);
      })
      .catch(() => {
        if (!cancelled) setServerRecipients(null);
      });
    return () => {
      cancelled = true;
    };
  }, [actorId, role]);

  return isApiMode && serverRecipients ? serverRecipients : localRecipients;
};
