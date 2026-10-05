import { useMemo, useState } from 'react';
import type { SparkType } from '@/models';
import { useSpark } from './SparkContext';
import { calculateBalances } from '@/utils/sparkRules';

export function useLedgerController() {
  const { snapshot, currentUserId } = useSpark();
  const [type, setType] = useState<'All' | SparkType>('All');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'All' | 'Credit' | 'Debit'>('All');

  const result = useMemo(() => {
    if (!snapshot) return { transactions: [], balances: { White: 0, Yellow: 0, Blue: 0, Radiant: 0 } };
    const search = query.trim().toLowerCase();
    const transactions = snapshot.transactions
      .filter((item) => {
        if (item.employeeId !== currentUserId) return false;
        if (type !== 'All' && item.sparkType !== type) return false;
        if (direction !== 'All' && item.transactionType !== direction) return false;
        return !search || `${item.category} ${item.description} ${item.source}`.toLowerCase().includes(search);
      })
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    return { transactions, balances: calculateBalances(snapshot.transactions, currentUserId) };
  }, [snapshot, currentUserId, type, direction, query]);

  const employeeLabel = (id?: string) =>
    id ? (snapshot?.employees.find((employee) => employee.id === id)?.name ?? id) : 'System / not applicable';
  return { ...result, type, setType, query, setQuery, direction, setDirection, employeeLabel };
}
