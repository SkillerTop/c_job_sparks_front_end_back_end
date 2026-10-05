import { CheckCircle2, Languages, Mail, Send } from 'lucide-react';
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
  onRequestVerification,
  onSaveLanguage,
}: {
  preferences: ProfilePreferences;
  busy: 'email' | 'preferences' | null;
  onRequestVerification: (email: string) => Promise<void>;
  onSaveLanguage: (language: InterfaceLanguage) => Promise<void>;
}) {
  const { t } = useUserPreferences();
  const emailId = useId();
  const languageId = useId();
  const [email, setEmail] = useState(preferences.contactEmail);
  const [language, setLanguage] = useState(preferences.language);
  const [emailMessage, setEmailMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [languageMessage, setLanguageMessage] = useState<{ tone: 'success' | 'error'; key: 'contact.languageSaved' | 'contact.languageError' } | null>(null);

  useEffect(() => {
    setEmail(preferences.pendingEmail ?? preferences.contactEmail);
    setLanguage(preferences.language);
  }, [preferences]);

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    setEmailMessage(null);
    try {
      await onRequestVerification(email);
      setEmailMessage({ tone: 'success', text: t('contact.sent', { email: email.trim().toLowerCase() }) });
    } catch (caught) {
      setEmailMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('contact.sendError') });
    }
  };

  const submitLanguage = async (event: FormEvent) => {
    event.preventDefault();
    setLanguageMessage(null);
    try {
      await onSaveLanguage(language);
      setLanguageMessage({ tone: 'success', key: 'contact.languageSaved' });
    } catch (caught) {
      setLanguageMessage({ tone: 'error', key: 'contact.languageError' });
    }
  };

  return (
    <section className={styles.settingsCard} aria-labelledby="contact-settings-title">
      <div className={styles.sectionTitle}>
        <span><Mail size={19} aria-hidden="true" /></span>
        <div><p>{t('contact.eyebrow')}</p><h2 id="contact-settings-title">{t('contact.title')}</h2></div>
      </div>

      <form className={styles.settingsForm} onSubmit={submitEmail} noValidate>
        <label className={styles.field} htmlFor={emailId}>
          <span>{t('contact.email')}</span>
          <small>{t('contact.emailHint')}</small>
          <input
            id={emailId}
            name="contact-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setEmailMessage(null); }}
            aria-describedby={preferences.pendingEmail ? `${emailId}-pending` : undefined}
            required
          />
        </label>
        {preferences.pendingEmail && (
          <div className={styles.pendingVerification} id={`${emailId}-pending`}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span><strong>{t('contact.pending')}</strong>{t('contact.pendingText', { email: preferences.pendingEmail })}</span>
          </div>
        )}
        {emailMessage && <Feedback tone={emailMessage.tone}>{emailMessage.text}</Feedback>}
        <button className={styles.primaryButton} type="submit" disabled={busy === 'email'}>
          <Send size={16} aria-hidden="true" /> {busy === 'email' ? t('contact.sending') : preferences.pendingEmail ? t('contact.resend') : t('contact.send')}
        </button>
      </form>

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
        <button className={styles.secondaryButton} type="submit" disabled={busy === 'preferences' || language === preferences.language}>
          {busy === 'preferences' ? t('contact.saving') : t('contact.saveLanguage')}
        </button>
      </form>
    </section>
  );
}
