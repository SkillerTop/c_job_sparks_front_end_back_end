import { apiAuthService } from '../apiAuthService';

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from '@/constants/security';

export const AUTH_CHANGE_EVENT = 'c-job-auth-change';
export const AUTH_STATE_STORAGE_KEY = 'c-job-auth-state-v1';

export class AuthServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const authService = apiAuthService;
