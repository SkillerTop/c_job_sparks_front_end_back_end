import { apiAuthService } from '../apiAuthService';

export const AUTH_CHANGE_EVENT = 'c-job-auth-change';
export const AUTH_STATE_STORAGE_KEY = 'c-job-auth-state-v1';
export const MAX_PASSWORD_LENGTH = 128;

export class AuthServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const validatePassword = (password: string) => {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (password.length > MAX_PASSWORD_LENGTH) issues.push(`Use no more than ${MAX_PASSWORD_LENGTH} characters.`);
  if (!/[a-z]/.test(password)) issues.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) issues.push('Add an uppercase letter.');
  if (!/\d/.test(password)) issues.push('Add a number.');
  return { valid: issues.length === 0, issues };
};

export const authService = apiAuthService;
