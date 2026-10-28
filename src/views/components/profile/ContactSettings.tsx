import { Languages, Mail } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { PROFILE_LANGUAGE_OPTIONS } from '@/constants/profile';
import type { InterfaceLanguage, ProfilePreferences } from '@/models/profile';
import { Feedback } from '@/views/components/common/Feedback';
import { SelectField } from '@/views/components/ui/SelectField';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/profile.module.css';

export function ContactSettings({
  preferences,
  busy,
  onSaveLanguage,
}: {
  preferences: ProfilePreferences;
  busy: boolean;
  onSaveLanguage: (language: InterfaceLanguage) => Promise<void>;
}) {
  const { t } = useUserPreferences();
  const emailId = useId();
  const languageId = useId();
  const [language, setLanguage] = useState(preferences.language);
  const [languageMessage, setLanguageMessage] = useState<{ tone: 'success' | 'error'; key: 'contact.languageSaved' | 'contact.languageError' } | null>(null);

  useEffect(() => {
    setLanguage(preferences.language);
  }, [preferences]);

  const submitLanguage = async (event: FormEvent) => {
    event.preventDefault();
    setLanguageMessage(null);
    try {
      await onSaveLanguage(language);
      setLanguageMessage({ tone: 'success', key: 'contact.languageSaved' });
    } catch {
      setLanguageMessage({ tone: 'error', key: 'contact.languageError' });
    }
  };

  return (
    <section className={styles.settingsCard} aria-labelledby="contact-settings-title">
      <div className={styles.sectionTitle}>
        <span><Mail size={19} aria-hidden="true" /></span>
        <div><p>{t('contact.eyebrow')}</p><h2 id="contact-settings-title">{t('contact.title')}</h2></div>
      </div>

      <div className={styles.settingsForm}>
        <label className={styles.field} htmlFor={emailId}>
          <span>{t('contact.email')}</span>
          <small>{t('contact.emailHint')}</small>
          <input
            id={emailId}
            name="contact-email"
            type="email"
            value={preferences.contactEmail}
            readOnly
            aria-readonly="true"
          />
        </label>
      </div>

      <div className={styles.cardDivider} />

      <form className={styles.settingsForm} onSubmit={submitLanguage}>
        <label className={styles.fieldLabel} id={`${languageId}-label`}>{t('contact.language')}</label>
        <SelectField
          id={languageId}
          name="language"
          value={language}
          options={PROFILE_LANGUAGE_OPTIONS}
          onChange={setLanguage}
          ariaLabel={t('contact.language')}
          ariaDescribedBy={`${languageId}-hint`}
          icon={<Languages size={16} aria-hidden="true" />}
        />
        <small className={styles.fieldHint} id={`${languageId}-hint`}>{t('contact.languageHint')}</small>
        {languageMessage && <Feedback tone={languageMessage.tone}>{t(languageMessage.key)}</Feedback>}
        <button className={styles.secondaryButton} type="submit" disabled={busy || language === preferences.language}>
          {busy ? t('contact.saving') : t('contact.saveLanguage')}
        </button>
      </form>
    </section>
  );
}
