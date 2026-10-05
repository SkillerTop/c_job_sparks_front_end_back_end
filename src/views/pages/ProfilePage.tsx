import { AlertTriangle, RefreshCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useProfileController } from '@/controllers/useProfileController';
import { ContactSettings } from '@/views/components/profile/ContactSettings';
import { EmployeeProfileCard } from '@/views/components/profile/EmployeeProfileCard';
import { NotificationSettings } from '@/views/components/profile/NotificationSettings';
import { PasswordSettings } from '@/views/components/profile/PasswordSettings';
import { SessionManager } from '@/views/components/profile/SessionManager';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import styles from '@/views/styles/profile.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

type ProfileSection = 'profile' | 'preferences' | 'security' | 'sessions';

export function ProfilePage() {
  const controller = useProfileController();
  const { t } = useUserPreferences();
  const { profile, preferences, sessions, loading, busyAction, loadError } = controller;
  const [activeSection, setActiveSection] = useState<ProfileSection>('profile');

  if (loading || !profile.employee || !preferences) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('profile.eyebrow')} title={t('profile.title')} description={t('profile.description')} />
        {loadError ? (
          <div className={styles.loadError} role="alert">
            <AlertTriangle size={24} aria-hidden="true" />
            <div><strong>{t('profile.loadErrorTitle')}</strong><p>{loadError}</p></div>
            <button type="button" onClick={() => void controller.refresh()}><RefreshCcw size={16} /> {t('profile.tryAgain')}</button>
          </div>
        ) : (
          <div className={styles.profileSkeleton} role="status" aria-label={t('profile.loading')}>
            <span /><span /><span />
          </div>
        )}
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        description={t('profile.description')}
        action={<span className={styles.settingsBadge}><Settings2 size={15} aria-hidden="true" /> {t('profile.badge')}</span>}
      />

      <div className={styles.profileTabs} role="tablist" aria-label={t('profile.sections')}>
        {([
          ['profile', t('profile.sectionProfile')],
          ['preferences', t('profile.sectionPreferences')],
          ['security', t('profile.sectionSecurity')],
          ['sessions', t('profile.sectionSessions')],
        ] as const).map(([section, label]) => (
          <button
            key={section}
            id={`profile-tab-${section}`}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            aria-controls={`profile-panel-${section}`}
            className={activeSection === section ? styles.profileTabActive : styles.profileTab}
            onClick={() => setActiveSection(section)}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        id="profile-panel-profile"
        className={styles.profileSection}
        role="tabpanel"
        aria-labelledby="profile-tab-profile"
        hidden={activeSection !== 'profile'}
      >
        <EmployeeProfileCard
          employee={profile.employee}
          department={profile.department}
          manager={profile.manager}
          role={profile.role}
          avatarDataUrl={preferences.avatarDataUrl}
          busy={busyAction === 'avatar'}
          onUpdateAvatar={async (file) => { await controller.updateAvatar(file); }}
          onRemoveAvatar={async () => { await controller.removeAvatar(); }}
        />
      </section>

      <section
        id="profile-panel-preferences"
        className={styles.profileSection}
        role="tabpanel"
        aria-labelledby="profile-tab-preferences"
        hidden={activeSection !== 'preferences'}
      >
        <div className={styles.settingsGrid}>
          <ContactSettings
            preferences={preferences}
            busy={busyAction === 'email' ? 'email' : busyAction === 'preferences' ? 'preferences' : null}
            onRequestVerification={async (email) => { await controller.requestEmailVerification(email); }}
            onSaveLanguage={async (language) => {
              await controller.savePreferences(language, preferences.notifications);
            }}
          />
          <NotificationSettings
            value={preferences.notifications}
            busy={busyAction === 'preferences'}
            onSave={async (notifications) => {
              await controller.savePreferences(preferences.language, notifications);
            }}
          />
        </div>
      </section>

      <section
        id="profile-panel-security"
        className={`${styles.profileSection} ${styles.settingsSingle}`}
        role="tabpanel"
        aria-labelledby="profile-tab-security"
        hidden={activeSection !== 'security'}
      >
        <PasswordSettings
          busy={busyAction === 'password'}
          onChangePassword={async (input) => { await controller.changePassword(input); }}
        />
      </section>

      <section
        id="profile-panel-sessions"
        className={styles.profileSection}
        role="tabpanel"
        aria-labelledby="profile-tab-sessions"
        hidden={activeSection !== 'sessions'}
      >
        <SessionManager
          sessions={sessions}
          busy={busyAction === 'session' || busyAction === 'all-sessions'}
          onTerminate={controller.terminateSession}
          onSignOutAll={controller.signOutAll}
        />
      </section>
    </PageTransition>
  );
}
