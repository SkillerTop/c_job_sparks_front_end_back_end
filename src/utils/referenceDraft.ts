import type { AppSnapshot, ReferenceDraft } from '@/models';

export const createReferenceDraft = (kind: ReferenceDraft['kind'], snapshot: AppSnapshot): ReferenceDraft => {
  const base = { id: '', name: '', active: true };
  switch (kind) {
    case 'employees':
      return {
        kind,
        data: {
          ...base,
          initials: '',
          title: '',
          email: '',
          role: 'Employee',
          departmentId: snapshot.departments.find((department) => department.active)?.id ?? '',
          hasCoordinationExperience: false,
          managerId: '',
        },
      };
    case 'departments':
      return { kind, data: { ...base, headId: '' } };
    case 'categories':
      return {
        kind,
        data: {
          ...base,
          description: '',
          sparkType: 'Yellow',
          amount: 1,
          period: 'Quarterly',
        },
      };
  }
};
