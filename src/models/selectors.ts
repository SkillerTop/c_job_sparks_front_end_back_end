import type { AppSnapshot, Role } from './index';

const activeWorkedProjectTeams = (snapshot: AppSnapshot, employeeId: string) =>
  snapshot.projectTeams.filter(
    (team) =>
      team.active &&
      team.members.some((member) => member.employeeId === employeeId && member.workedHours > 0),
  );

export const selectActiveProjectColleagues = (snapshot: AppSnapshot, employeeId: string) => {
  const colleagueIds = new Set(
    activeWorkedProjectTeams(snapshot, employeeId).flatMap((team) =>
      team.members
        .filter((member) => member.employeeId !== employeeId && member.workedHours > 0)
        .map((member) => member.employeeId),
    ),
  );
  return snapshot.employees.filter(
    (employee) =>
      colleagueIds.has(employee.id) && employee.active && employee.role !== 'Administrator',
  );
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
  const actor = snapshot.employees.find((employee) => employee.id === actorId);
  const activeProjectColleagueIds = new Set(
    role === 'Coordinator'
      ? selectActiveProjectColleagues(snapshot, actorId).map((employee) => employee.id)
      : [],
  );
  return snapshot.employees.filter((employee) => {
    if (!employee.active || employee.role === 'Administrator') return false;
    if (role === 'Coordinator') return activeProjectColleagueIds.has(employee.id);
    if (role === 'Head') return employee.departmentId === actor?.departmentId;
    if (role === 'GPM') return true;
    return role === 'Top Management';
  });
};

export const selectTeamMembers = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  const actor = snapshot.employees.find((employee) => employee.id === actorId);
  return snapshot.employees.filter((employee) => {
    if (!employee.active || employee.role === 'Administrator') return false;
    if (role === 'Head' || role === 'Coordinator') return employee.departmentId === actor?.departmentId;
    if (role === 'GPM') return true;
    return role === 'Top Management';
  });
};

export const selectPendingRequests = (snapshot: AppSnapshot, actorId: string, role: Role) => {
  const actor = snapshot.employees.find((employee) => employee.id === actorId);
  const inDepartment = (employeeId: string) =>
    snapshot.employees.some(
      (employee) => employee.id === employeeId && employee.departmentId === actor?.departmentId,
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

export const selectPendingDepartmentDisenchantRequests = (
  snapshot: AppSnapshot,
  actorId: string,
  role: Role,
) => {
  if (role !== 'Head') return [];
  const actor = snapshot.employees.find((employee) => employee.id === actorId);
  if (!actor) return [];
  return snapshot.disenchantRequests
    .filter(
      (request) =>
        request.status === 'Created' && request.departmentId === actor.departmentId,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
