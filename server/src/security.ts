import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
  });

export const verifyPassword = async (passwordHash: string, password: string) => {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
};

export const validatePassword = (password: string) => {
  const issues: string[] = [];
  if (password.length < 10) issues.push('Use at least 10 characters.');
  if (password.length > 128) issues.push('Use no more than 128 characters.');
  if (!/[a-z]/.test(password)) issues.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) issues.push('Add an uppercase letter.');
  if (!/\d/.test(password)) issues.push('Add a number.');
  return { valid: issues.length === 0, issues };
};

export const opaqueToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
};
export const requestHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');

export const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
