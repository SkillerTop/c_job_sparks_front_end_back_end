import type { AuthenticatedPrincipal, Role } from './domain.js';
import { forbidden } from './errors.js';
import { WORKSPACE_SECTION_ROLES, type WorkspaceSectionContract } from './contracts.js';

export const requireRole = (principal: AuthenticatedPrincipal, roles: readonly Role[]) => {
  if (!roles.includes(principal.role)) throw forbidden();
  return principal;
};

export const departmentScopeIds = (principal: AuthenticatedPrincipal) => {
  const explicit = (principal.departmentIds ?? []).filter(Boolean);
  return [...new Set(explicit.length ? explicit : [principal.departmentId])];
};

export const hasDepartmentScope = (principal: AuthenticatedPrincipal, departmentId: string) =>
  departmentScopeIds(principal).includes(departmentId);

export const PERSONAL_LEDGER_ROLES: readonly Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'];

export const requireWorkspaceSection = (principal: AuthenticatedPrincipal, section: WorkspaceSectionContract) => {
  const allowed = WORKSPACE_SECTION_ROLES[section];
  if (allowed) requireRole(principal, allowed);
  if ((section === 'dashboard' || section === 'profile') && principal.role === 'Administrator')
    throw forbidden('Administrators do not have a personal workspace.');
  return principal;
};
