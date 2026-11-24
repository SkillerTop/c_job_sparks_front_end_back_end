import type { AppSnapshot, ReferenceDraft } from '@/models';

export const createReferenceDraft = (kind: ReferenceDraft['kind'], snapshot: AppSnapshot): ReferenceDraft => {
  const base = { id: '', name: '', active: true };
  switch (kind) {
    case 'employees': {
      const primaryDepartmentId = snapshot.departments.find((department) => department.active)?.id ?? '';
      return {
        kind,
        data: {
          ...base,
          initials: '',
          title: '',
          email: '',
          role: 'Employee',
          departmentId: primaryDepartmentId,
          hasCoordinationExperience: false,
          managerId: '',
          coordinatorIds: [],
        },
      };
    }
    case 'departments':
      return { kind, data: { ...base, headId: '' } };
    case 'categories':
      return {
        kind,
        data: {
          ...base,
          description: '',
          sparkType: 'Yellow',
          usageType: 'Award',
          amount: 1,
          period: 'Quarterly',
        },
      };
  }
};
