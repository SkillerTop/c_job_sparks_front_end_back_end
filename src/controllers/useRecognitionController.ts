import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RecognitionInput } from '@/models';
import { useSpark } from '@/controllers/SparkContext';
import { recognitionQuota } from '@/utils/sparkRules';
import { quarterForDate } from '@/utils/quarter';

const emptyForm: RecognitionInput = { recipientId: '', category: '', description: '' };

export function useRecognitionController() {
  const { snapshot, currentUserId, activeRole, createRecognition } = useSpark();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<RecognitionInput>(emptyForm);
  const [departmentId, setDepartmentId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const currentEmployee = snapshot?.employees.find((employee) => employee.id === currentUserId);
  const ownDepartmentIds = useMemo(
    () => currentEmployee?.departmentId ? [currentEmployee.departmentId] : [],
    [currentEmployee],
  );
  const activeDepartmentId = departmentId || currentEmployee?.departmentId || ownDepartmentIds[0] || '';
  const recipients = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.employees.filter(
      (employee) =>
        employee.active &&
        employee.id !== currentUserId &&
        ['Employee', 'Coordinator', 'GPM'].includes(employee.role) &&
        Boolean(activeDepartmentId) &&
        employee.departmentId === activeDepartmentId,
    );
  }, [snapshot, currentUserId, activeDepartmentId]);
  const requestedRecipient = searchParams.get('recipient');
  useEffect(() => {
    if (!requestedRecipient || !snapshot) return;
    const requested = snapshot.employees.find((employee) => employee.id === requestedRecipient && employee.active);
    if (!requested || !['Employee', 'Coordinator', 'GPM'].includes(requested.role)) return;
    const sharedDepartmentId = ownDepartmentIds.find((id) => id === requested.departmentId);
    if (!sharedDepartmentId) return;
    if (sharedDepartmentId !== activeDepartmentId) setDepartmentId(sharedDepartmentId);
    setForm((current) =>
      current.recipientId ? current : { ...current, recipientId: requestedRecipient },
    );
  }, [requestedRecipient, snapshot, activeDepartmentId, ownDepartmentIds]);

  const selectDepartment = (value: string) => {
    setDepartmentId(value);
    setForm((current) => ({ ...current, recipientId: '' }));
    setErrors((current) => ({ ...current, recipientId: '' }));
    setMessage(null);
  };
  const ownRecognitions = useMemo(
    () =>
      snapshot?.recognitions
        .filter((item) => item.senderId === currentUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
    [snapshot, currentUserId],
  );
  const usedCount = ownRecognitions.filter(
    (item) =>
      item.status !== 'Rejected' && quarterForDate(item.createdAt) === snapshot?.settings.currentQuarter,
  ).length;
  const quota = snapshot
    ? recognitionQuota(
        currentUserId,
        activeRole,
        snapshot.settings,
        snapshot.employees,
        snapshot.projectTeams,
      )
    : 1;

  const setField = (field: keyof RecognitionInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setMessage(null);
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.recipientId) nextErrors.recipientId = 'Choose a recipient.';
    if (!form.category) nextErrors.category = 'Choose a recognition category.';
    if (!form.description.trim()) nextErrors.description = 'Describe the contribution.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setMessage({ tone: 'error', text: 'Review the highlighted fields.' });
      return false;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await createRecognition(form);
      setForm(emptyForm);
      setMessage({ tone: 'success', text: 'Recognition sent to the Head for approval.' });
      return true;
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not create the recognition.',
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    setField,
    errors,
    submitting,
    message,
    recipients,
    departmentId: activeDepartmentId,
    departments: snapshot?.departments.filter((department) =>
      department.active && ownDepartmentIds.includes(department.id)) ?? [],
    selectDepartment,
    ownRecognitions,
    quota,
    usedCount,
    categories:
      snapshot?.categories
        .filter((category) => category.active && category.usageType === 'PeerRecognition')
        .map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          sparkType: category.sparkType,
          usageType: category.usageType,
          amount: category.amount,
          period: category.period,
          active: category.active,
        })) ?? [],
    submit,
  };
}
