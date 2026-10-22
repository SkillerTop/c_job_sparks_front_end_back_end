import type { ReactNode } from 'react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

export function LocalizedText({ children }: { children: ReactNode }) {
  const { localize } = useUserPreferences();
  return <>{typeof children === 'string' ? localize(children) : children}</>;
}
