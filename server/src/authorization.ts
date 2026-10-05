import type { AuthenticatedPrincipal, Role } from './domain.js';
import { forbidden } from './errors.js';

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
export const PEER_ROLES: readonly Role[] = ['Employee', 'Coordinator', 'GPM'];
export const AWARD_ROLES: readonly Role[] = ['Coordinator', 'GPM', 'Head', 'Top Management'];
export const COMPANY_ACHIEVEMENT_ROLES: readonly Role[] = ['GPM', 'Top Management', 'Administrator'];
