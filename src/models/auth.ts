import type { Role } from './index';
import type { PasswordChangeInput } from './profile';

export type AuthAccountStatus = 'Pending' | 'Approved' | 'Rejected' | 'Disabled';
export type AuthAccountSource = 'Seed' | 'Registration';

export interface AuthAccount {
  id: string;
  employeeId: string;
  email: string;
  status: AuthAccountStatus;
  source: AuthAccountSource;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AuthUser {
  accountId: string;
  employeeId: string;
  email: string;
  name: string;
  initials: string;
  title: string;
  departmentId: string;
  role: Role;
}

export interface AuthAuditEvent {
  id: string;
  accountId: string;
  action:
    | 'REGISTRATION_SUBMITTED'
    | 'REGISTRATION_RESUBMITTED'
    | 'REGISTRATION_APPROVED'
    | 'REGISTRATION_REJECTED'
    | 'PASSWORD_CHANGED';
  actorId: string;
  createdAt: string;
  details: string;
}

export interface AuthAccessState {
  accounts: AuthAccount[];
  auditEvents: AuthAuditEvent[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegistrationInput extends LoginInput {
  confirmPassword: string;
}

export type { PasswordChangeInput };
