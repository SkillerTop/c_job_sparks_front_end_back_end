import { useMemo } from 'react';
import { useSpark } from './SparkContext';
import { calculateBalances } from '@/utils/sparkRules';
import { selectPendingRequests } from '@/models/selectors';
import { quarterForDate, quarterOrder } from '@/utils/quarter';

export function useDashboardController() {
  const { snapshot, currentUserId, activeRole } = useSpark();
  return useMemo(() => {
    if (!snapshot) return null;
    const user = snapshot.employees.find((employee) => employee.id === currentUserId)!;
    const department = snapshot.departments.find((item) => item.id === user.departmentId)!;
    const balances = calculateBalances(snapshot.transactions, currentUserId);
    const recentTransactions = snapshot.transactions
      .filter((item) => item.employeeId === currentUserId)
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
      .slice(0, 4);
    const received = snapshot.achievements.filter(
      (item) =>
        item.employeeId === currentUserId && quarterForDate(item.date) === snapshot.settings.currentQuarter,
    );
    const pending = selectPendingRequests(snapshot, currentUserId, activeRole);
    const pendingApprovals = pending.recognitions.length + pending.awards.length;
    const latestPerformance = snapshot.performance
      .filter((item) => item.employeeId === currentUserId)
      .sort((a, b) => quarterOrder(a.quarter) - quarterOrder(b.quarter))
      .at(-1);
    const categories = new Set(received.map((item) => item.category)).size;
    const lifetimeAchievements = snapshot.achievements.filter(
      (item) => item.employeeId === currentUserId,
    ).length;
    return {
      user: { ...user, role: activeRole },
      department,
      balances,
      recentTransactions,
      received,
      pendingApprovals,
      categories,
      lifetimeAchievements,
      latestPerformance,
      settings: snapshot.settings,
    };
  }, [snapshot, currentUserId, activeRole]);
}
