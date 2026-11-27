import { useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, Role } from '@/models';
import { apiRequest, isApiMode } from '@/services/apiClient';

export interface RecognitionRecipientOption {
  id: string;
  name: string;
  title: string;
}

interface EligibleRecipientResponse extends RecognitionRecipientOption {
  departmentId: string;
  departmentIds: string[];
  role: Role;
}

export const useRecognitionRecipients = (
  snapshot: AppSnapshot | null,
  actorId: string,
): RecognitionRecipientOption[] => {
  const localRecipients = useMemo(
    () => snapshot?.employees.filter(
      (employee) =>
        employee.active &&
        employee.id !== actorId &&
        ['Employee', 'Coordinator', 'GPM'].includes(employee.role),
    ) ?? [],
    [snapshot, actorId],
  );
  const [serverRecipients, setServerRecipients] = useState<EligibleRecipientResponse[] | null>(null);

  useEffect(() => {
    if (!isApiMode) return;
    let cancelled = false;
    setServerRecipients(null);
    void apiRequest<EligibleRecipientResponse[]>('/api/v1/eligible-recipients?purpose=recognition')
      .then((recipients) => {
        if (!cancelled) setServerRecipients(recipients);
      })
      .catch(() => {
        if (!cancelled) setServerRecipients(null);
      });
    return () => {
      cancelled = true;
    };
  }, [actorId]);

  return isApiMode && serverRecipients ? serverRecipients : localRecipients;
};
