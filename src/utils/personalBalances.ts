import type { AppSnapshot, SparkBalances } from '@/models';
import { calculateBalances, calculateLifetimeEarnings } from '@/utils/sparkRules';

type PersonalBalanceSource = Pick<AppSnapshot, 'shell' | 'transactions'>;
type LifetimeEarningsSource = Pick<AppSnapshot, 'lifetimeEarnings' | 'transactions'>;

export const selectAuthoritativeBalances = (
  snapshot: PersonalBalanceSource,
  employeeId: string,
): SparkBalances => snapshot.shell?.balances ?? calculateBalances(snapshot.transactions, employeeId);

export const selectAuthoritativeLifetimeEarnings = (
  snapshot: LifetimeEarningsSource,
  employeeId: string,
): SparkBalances => snapshot.lifetimeEarnings ?? calculateLifetimeEarnings(snapshot.transactions, employeeId);
