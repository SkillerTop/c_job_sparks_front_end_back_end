import { BellRing, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PROFILE_NOTIFICATION_OPTIONS } from '@/constants/profile';
import type { NotificationPreferences } from '@/models/profile';
import { Feedback } from '@/views/components/common/Feedback';
import styles from '@/views/styles/profile.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { TranslationKey } from '@/constants/translations';

export function NotificationSettings({
  value,
  busy,
  onSave,
}: {
  value: NotificationPreferences;
  busy: boolean;
  onSave: (next: NotificationPreferences) => Promise<void>;
}) {
  const { t } = useUserPreferences();
  const [notifications, setNotifications] = useState(value);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => setNotifications(value), [value]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await onSave(notifications);
      setMessage({ tone: 'success', text: t('notifications.saved') });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('notifications.error') });
    }
  };

  return (
    <section className={styles.settingsCard} aria-labelledby="notification-settings-title">
      <div className={styles.sectionTitle}>
        <span><BellRing size={19} aria-hidden="true" /></span>
        <div><p>{t('notifications.eyebrow')}</p><h2 id="notification-settings-title">{t('notifications.title')}</h2></div>
      </div>
      <form className={styles.notificationForm} onSubmit={submit}>
        <fieldset>
          <legend className={styles.srOnly}>{t('notifications.categories')}</legend>
          {PROFILE_NOTIFICATION_OPTIONS.map((option) => (
            <label className={styles.switchRow} key={option.key}>
              <span>
                <strong>{t(`notifications.${option.key}` as TranslationKey)}</strong>
                <small>{t(`notifications.${option.key}Description` as TranslationKey)}</small>
              </span>
              <input
                type="checkbox"
                checked={notifications[option.key]}
                onChange={(event) => {
                  setNotifications((current) => ({ ...current, [option.key]: event.target.checked }));
                  setMessage(null);
                }}
              />
              <span className={styles.switchControl} aria-hidden="true"><span /></span>
            </label>
          ))}
        </fieldset>
        {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          <Save size={16} aria-hidden="true" /> {busy ? t('notifications.saving') : t('notifications.save')}
        </button>
      </form>
    </section>
  );
}
