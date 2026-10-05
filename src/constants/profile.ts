import type { InterfaceLanguage, NotificationPreferences } from '@/models/profile';

export const PROFILE_LANGUAGE_OPTIONS: ReadonlyArray<{ value: InterfaceLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Українська' },
  { value: 'ru', label: 'Русский' },
];

export const PROFILE_NOTIFICATION_OPTIONS: ReadonlyArray<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  { key: 'rewards', label: 'Rewards', description: 'New Sparks, achievements and reward updates.' },
  { key: 'approvals', label: 'Approvals', description: 'Requests that need a decision or change status.' },
  { key: 'purchases', label: 'Purchases', description: 'Reward Shop receipts and activations.' },
  { key: 'system', label: 'System events', description: 'Security, account and important service updates.' },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  rewards: true,
  approvals: true,
  purchases: true,
  system: true,
};
