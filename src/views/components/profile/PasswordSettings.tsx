import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { PasswordChangeInput } from '@/models/profile';
import { Feedback } from '@/views/components/common/Feedback';
import styles from '@/views/styles/profile.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

const emptyPassword: PasswordChangeInput = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function PasswordSettings({
  busy,
  onChangePassword,
}: {
  busy: boolean;
  onChangePassword: (input: PasswordChangeInput) => Promise<void>;
}) {
  const { t } = useUserPreferences();
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const [values, setValues] = useState(emptyPassword);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const update = (field: keyof PasswordChangeInput, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (values.newPassword !== values.confirmPassword) {
      setMessage({ tone: 'error', text: t('password.mismatch') });
      return;
    }
    try {
      await onChangePassword(values);
      setValues(emptyPassword);
      setMessage({ tone: 'success', text: t('password.success') });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('password.error') });
    }
  };

  return (
    <section className={styles.settingsCard} aria-labelledby="password-settings-title">
      <div className={styles.sectionTitle}>
        <span><KeyRound size={19} aria-hidden="true" /></span>
        <div><p>{t('password.eyebrow')}</p><h2 id="password-settings-title">{t('password.title')}</h2></div>
      </div>
      <form className={styles.settingsForm} onSubmit={submit}>
        <label className={styles.field} htmlFor={currentId}>
          <span>{t('password.current')}</span>
          <input id={currentId} type={show ? 'text' : 'password'} autoComplete="current-password" value={values.currentPassword} onChange={(event) => update('currentPassword', event.target.value)} required />
        </label>
        <label className={styles.field} htmlFor={nextId}>
          <span>{t('password.new')}</span>
          <input id={nextId} type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={values.newPassword} onChange={(event) => update('newPassword', event.target.value)} aria-describedby={`${nextId}-hint`} required />
          <small id={`${nextId}-hint`}>{t('password.hint')}</small>
        </label>
        <label className={styles.field} htmlFor={confirmId}>
          <span>{t('password.confirm')}</span>
          <input id={confirmId} type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={values.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} required />
        </label>
        <button className={styles.passwordVisibility} type="button" onClick={() => setShow((current) => !current)} aria-pressed={show}>
          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          {show ? t('password.hide') : t('password.show')}
        </button>
        {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
        <button className={styles.primaryButton} type="submit" disabled={busy || !values.currentPassword || !values.newPassword || !values.confirmPassword}>
          <ShieldCheck size={16} aria-hidden="true" /> {busy ? t('password.updating') : t('password.update')}
        </button>
      </form>
    </section>
  );
}
