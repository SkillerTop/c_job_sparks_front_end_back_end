export type InterfaceLanguage = 'en' | 'uk' | 'ru';

export interface NotificationPreferences {
  rewards: boolean;
  approvals: boolean;
  purchases: boolean;
  system: boolean;
}

export interface ProfilePreferences {
  employeeId: string;
  contactEmail: string;
  pendingEmail?: string;
  verificationRequestedAt?: string;
  language: InterfaceLanguage;
  notifications: NotificationPreferences;
  avatarDataUrl?: string;
}

export type SessionDevice = 'desktop' | 'mobile';

export interface ActiveSession {
  id: string;
  deviceName: string;
  deviceDetails: string;
  location: string;
  lastActiveAt: string;
  current: boolean;
  device: SessionDevice;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
