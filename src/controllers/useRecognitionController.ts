import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RecognitionInput } from '@/models';
import { useSpark } from './SparkContext';
import { recognitionQuota } from '@/utils/sparkRules';
import { quarterForDate } from '@/utils/quarter';

const emptyForm: RecognitionInput = { recipientId: '', category: '', description: '' };

export function useRecognitionController() {
  const { snapshot, currentUserId, activeRole, createRecognition } = useSpark();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<RecognitionInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const recipients = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.employees.filter(
      (employee) =>
        employee.active &&
        employee.id !== currentUserId &&
        ['Employee', 'Coordinator', 'GPM'].includes(employee.role),
    );
  }, [snapshot, currentUserId]);
  const requestedRecipient = searchParams.get('recipient');
  useEffect(() => {
    if (!requestedRecipient || !recipients.some((employee) => employee.id === requestedRecipient)) return;
    setForm((current) =>
      current.recipientId ? current : { ...current, recipientId: requestedRecipient },
    );
  }, [requestedRecipient, recipients]);
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
    ownRecognitions,
    quota,
    usedCount,
    categories:
      snapshot?.categories
        .filter((category) => category.active && category.sparkType === 'White')
        .map((category) => category.name) ?? [],
    submit,
  };
}
