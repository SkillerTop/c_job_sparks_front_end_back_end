import { useEffect, useMemo, useState } from 'react';
import type { Employee } from '@/models';
import {
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  validatePassword,
  authService,
} from '@/services/authService';

interface DemoAccountOption {
  employeeId: string;
  label: string;
  employee: Employee;
}

const demoMode = import.meta.env.VITE_APP_MODE !== 'api';

export function useAuthFormController() {
  const [microsoftSignInEnabled, setMicrosoftSignInEnabled] = useState(false);
  const [demoPassword, setDemoPassword] = useState('');
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountOption[]>([]);
  const [registrationDemos, setRegistrationDemos] = useState<Employee[]>([]);

  useEffect(() => {
    let active = true;
    void authService.getMicrosoftAuthConfig()
      .then(({ enabled }) => {
        if (active) setMicrosoftSignInEnabled(enabled);
      })
      .catch(() => {
        if (active) setMicrosoftSignInEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    let active = true;
    void Promise.all([
      import('@/data/mockAuthData'),
      import('@/data/mockData'),
    ]).then(([authData, snapshotData]) => {
      if (!active) return;
      setDemoPassword(authData.DEMO_PASSWORD);
      setDemoAccounts(authData.DEMO_AUTH_ACCOUNTS.map((account) => ({
        ...account,
        employee: snapshotData.initialSnapshot.employees.find(
          (employee) => employee.id === account.employeeId,
        )!,
      })));
      setRegistrationDemos(snapshotData.initialSnapshot.employees.filter((employee) =>
        ['emp-nora', 'emp-daniel', 'emp-olivia'].includes(employee.id)));
    });
    return () => {
      active = false;
    };
  }, []);

  const primaryDemoAccounts = useMemo(
    () => demoAccounts.filter(({ label }) => ['Employee', 'Administrator'].includes(label)),
    [demoAccounts],
  );
  const moreDemoAccounts = useMemo(
    () => demoAccounts.filter(({ label }) => !['Employee', 'Administrator'].includes(label)),
    [demoAccounts],
  );
  return {
    demoPassword,
    primaryDemoAccounts,
    moreDemoAccounts,
    registrationDemos,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    normalizeEmail,
    validatePassword,
    isInvalidCredentialsError: (error: unknown) =>
      Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_CREDENTIALS'),
    microsoftSignInEnabled,
    startMicrosoftSignIn: (returnTo = '/') => window.location.assign(authService.microsoftSignInUrl(returnTo)),
  };
}
