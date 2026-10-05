import { useMemo } from 'react';
import { DEMO_AUTH_ACCOUNTS, DEMO_PASSWORD } from '@/data/mockAuthData';
import { initialSnapshot } from '@/data/mockData';
import {
  AuthServiceError,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  validatePassword,
} from '@/services/authService';

export function useAuthFormController() {
  const demoAccounts = useMemo(
    () =>
      DEMO_AUTH_ACCOUNTS.map((account) => ({
        ...account,
        employee: initialSnapshot.employees.find((employee) => employee.id === account.employeeId)!,
      })),
    [],
  );

  const primaryDemoAccounts = useMemo(
    () => demoAccounts.filter(({ label }) => ['Employee', 'Administrator'].includes(label)),
    [demoAccounts],
  );
  const moreDemoAccounts = useMemo(
    () => demoAccounts.filter(({ label }) => !['Employee', 'Administrator'].includes(label)),
    [demoAccounts],
  );
  const registrationDemos = useMemo(
    () =>
      initialSnapshot.employees.filter((employee) =>
        ['emp-nora', 'emp-daniel', 'emp-olivia'].includes(employee.id),
      ),
    [],
  );

  return {
    demoPassword: DEMO_PASSWORD,
    primaryDemoAccounts,
    moreDemoAccounts,
    registrationDemos,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    normalizeEmail,
    validatePassword,
    isInvalidCredentialsError: (error: unknown) =>
      error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS',
  };
}
