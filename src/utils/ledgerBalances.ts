import type { AppSnapshot, SparkBalances } from '@/models';
import { calculateBalances } from '@/utils/sparkRules';

type LedgerBalanceSource = Pick<AppSnapshot, 'shell' | 'transactions'>;

export const selectAuthoritativeLedgerBalances = (
  snapshot: LedgerBalanceSource,
  employeeId: string,
): SparkBalances => snapshot.shell?.balances ?? calculateBalances(snapshot.transactions, employeeId);
