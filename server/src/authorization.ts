import type { AuthenticatedPrincipal, Role } from './domain.js';
import { forbidden } from './errors.js';
import { WORKSPACE_SECTION_ROLES, type WorkspaceSectionContract } from './contracts.js';

export const requireRole = (principal: AuthenticatedPrincipal, roles: readonly Role[]) => {
  if (!roles.includes(principal.role)) throw forbidden();
  return principal;
};

export const requireOwnEmployee = (principal: AuthenticatedPrincipal, employeeId: string) => {
  if (principal.employeeId !== employeeId) throw forbidden('You can access only your own employee data.');
};

export const requireDepartmentScope = (principal: AuthenticatedPrincipal, departmentId: string) => {
  if (principal.role !== 'Head' || principal.departmentId !== departmentId)
    throw forbidden('This record is outside your department.');
};

export const isBusinessRole = (role: Role) => role !== 'Administrator';

export const WORKSPACE_ROLES: readonly Role[] = ['Employee', 'Coordinator', 'GPM', 'Head'];
export const PERSONAL_LEDGER_ROLES: readonly Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'];
export const PEER_ROLES: readonly Role[] = ['Employee', 'Coordinator', 'GPM'];
export const AWARD_ROLES: readonly Role[] = ['Coordinator', 'GPM', 'Head', 'Top Management'];
export const COMPANY_ACHIEVEMENT_ROLES: readonly Role[] = ['GPM', 'Head', 'Top Management', 'Administrator'];

export const requireWorkspaceSection = (principal: AuthenticatedPrincipal, section: WorkspaceSectionContract) => {
  const allowed = WORKSPACE_SECTION_ROLES[section];
  if (allowed) requireRole(principal, allowed);
  if ((section === 'dashboard' || section === 'profile') && principal.role === 'Administrator')
    throw forbidden('Administrators do not have a personal workspace.');
  return principal;
};
