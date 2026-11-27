import type { AppSnapshot, Role, SparkType } from './index';

const departmentScopeFor = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  if (role === 'Head') {
    const headed = snapshot.departments
      .filter((department) => department.active && department.headId === actorId)
      .map((department) => department.id);
    if (headed.length) return new Set(headed);
  }
  const actor = snapshot.employees.find((employee) => employee.id === actorId);
  return new Set(actor?.departmentIds ?? (actor ? [actor.departmentId] : []));
};

export const selectGpmControlledCoordinators = (snapshot: AppSnapshot, gpmId: string) => {
  const controlledIds = new Set(
    snapshot.projectTeams
      .filter((team) => team.active && team.gpmId === gpmId)
      .flatMap((team) =>
        team.members
          .filter(
            (member) =>
              member.workedHours > 0 &&
              (member.responsibility === 'Coordinator' || member.responsibility === 'Registrar'),
          )
          .map((member) => member.employeeId),
      ),
  );
  return snapshot.employees.filter(
    (employee) => controlledIds.has(employee.id) && employee.active && employee.role !== 'Administrator',
  );
};

export const selectAwardTargets = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  const actorDepartments = departmentScopeFor(snapshot, actorId, role);
  return snapshot.employees.filter((employee) => {
    if (!employee.active || employee.role === 'Administrator' || employee.id === actorId) return false;
    if (role === 'Top Management') return true;
    if (!['Employee', 'Coordinator'].includes(employee.role)) return false;
    if (role === 'Coordinator' || role === 'Head' || role === 'GPM')
      return (employee.departmentIds ?? [employee.departmentId])
      .some((departmentId) => actorDepartments.has(departmentId));
    return false;
  });
};

export const selectTeamMembers = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  const actorDepartments = departmentScopeFor(snapshot, actorId, role);
  return snapshot.employees.filter((employee) => {
    if (!employee.active || employee.role === 'Administrator') return false;
    if (role === 'Head') return (employee.departmentIds ?? [employee.departmentId])
      .some((departmentId) => actorDepartments.has(departmentId));
    if (role === 'GPM') return true;
    return role === 'Top Management';
  });
};

export const selectPendingRequests = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  const actorDepartments = departmentScopeFor(snapshot, actorId, role);
  const inDepartment = (employeeId: string) =>
    snapshot.employees.some(
      (employee) => employee.id === employeeId &&
        (employee.departmentIds ?? [employee.departmentId]).some((id) => actorDepartments.has(id)),
    );
  if (role === 'Administrator') return { recognitions: [], awards: [] };
  return {
    recognitions: snapshot.recognitions.filter(
      (item) =>
        item.status === 'Pending' &&
        (role === 'Head' ? inDepartment(item.recipientId) : item.senderId === actorId),
    ),
    awards: snapshot.awardRequests.filter(
      (item) =>
        item.status === 'Pending' &&
        (role === 'Head' ? inDepartment(item.employeeId) : item.awardedBy === actorId),
    ),
  };
};

export type ApprovalQueueItem = {
  id: string;
  kind: 'Recognition' | 'Award';
  sparkType: SparkType;
  employeeId: string;
  awardedBy: string;
  category: string;
  description: string;
  amount: number;
  createdAt: string;
};

export const selectApprovalQueue = (snapshot: AppSnapshot, actorId: string): ApprovalQueueItem[] => {
  const pending = selectPendingRequests(snapshot, actorId, 'Head');
  const recognitions = pending.recognitions.map((item) => ({
    id: item.id,
    kind: 'Recognition' as const,
    sparkType: 'White' as const,
    employeeId: item.recipientId,
    awardedBy: item.senderId,
    category: item.category,
    description: item.description,
    amount: item.amount,
    createdAt: item.createdAt,
  }));
  const awards = pending.awards.map((item) => ({
    id: item.id,
    kind: 'Award' as const,
    sparkType: item.sparkType,
    employeeId: item.employeeId,
    awardedBy: item.awardedBy,
    category: item.category,
    description: item.description,
    amount: item.amount,
    createdAt: item.createdAt,
  }));
  return [...recognitions, ...awards].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt));
};

export const selectPendingDepartmentDisenchantRequests = (
  snapshot: AppSnapshot,
  actorId: string,
  role: Role,
) => {
  if (role !== 'Head') return [];
  const actorDepartments = departmentScopeFor(snapshot, actorId, role);
  if (!actorDepartments.size) return [];
  return snapshot.disenchantRequests
    .filter(
      (request) =>
        request.status === 'Created' && actorDepartments.has(request.departmentId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
