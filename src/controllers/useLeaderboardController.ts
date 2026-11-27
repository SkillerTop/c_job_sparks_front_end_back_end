import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, Role } from '@/models';
import {
  createLeaderboardResponse,
  type LeaderboardResponse,
} from '@/models/leaderboard';
import { apiRequest, isApiMode } from '@/services/apiClient';
import { calculateLifetimeEarnings } from '@/utils/sparkRules';

const leaderboardRoles: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'];

const localLeaderboard = (
  snapshot: AppSnapshot,
  currentUserId: string,
  departmentId: string,
) => {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const previousTransactions = snapshot.transactions.filter(
    (transaction) => Date.parse(transaction.dateTime) < startOfMonth.getTime(),
  );
  const employees = snapshot.employees.filter(
    (employee) =>
      employee.active &&
      leaderboardRoles.includes(employee.role) &&
      (!departmentId || (employee.departmentIds ?? [employee.departmentId]).includes(departmentId)),
  );
  const totalEarned = (transactions: AppSnapshot['transactions'], employeeId: string) =>
    Object.values(calculateLifetimeEarnings(transactions, employeeId))
      .reduce((total, amount) => total + amount, 0);
  return createLeaderboardResponse(
    employees.map((employee) => ({
      employeeId: employee.id,
      name: employee.name,
      title: employee.title,
      departmentId: employee.departmentId,
      amount: totalEarned(snapshot.transactions, employee.id),
      previousAmount: totalEarned(previousTransactions, employee.id),
    })),
    currentUserId,
    departmentId || null,
    snapshot.departments
      .filter((department) => department.active)
      .map(({ id, name }) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
};

export const useLeaderboardController = (snapshot: AppSnapshot, currentUserId: string) => {
  const [departmentId, setDepartmentId] = useState('');
  const [serverData, setServerData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(isApiMode);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const demoData = useMemo(
    () => localLeaderboard(snapshot, currentUserId, departmentId),
    [snapshot, currentUserId, departmentId],
  );

  useEffect(() => {
    if (!isApiMode) return;
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (departmentId) query.set('departmentId', departmentId);
    setLoading(true);
    setError(null);
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    void apiRequest<LeaderboardResponse>(`/api/v1/leaderboard${suffix}`, {
      signal: controller.signal,
    })
      .then(setServerData)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the leaderboard.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currentUserId, departmentId, refreshToken]);

  const retry = useCallback(() => setRefreshToken((current) => current + 1), []);

  return {
    data: isApiMode ? serverData : demoData,
    departmentId,
    error,
    loading,
    retry,
    setDepartmentId,
  };
};
