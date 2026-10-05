import { Laptop, LogOut, MonitorSmartphone, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { ActiveSession } from '@/models/profile';
import { formatDateTime } from '@/utils/formatters';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import styles from '@/views/styles/profile.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

type Confirmation = { kind: 'single'; session: ActiveSession } | { kind: 'all' } | null;

export function SessionManager({
  sessions,
  busy,
  onTerminate,
  onSignOutAll,
}: {
  sessions: ActiveSession[];
  busy: boolean;
  onTerminate: (session: ActiveSession) => Promise<void>;
  onSignOutAll: () => Promise<void>;
}) {
  const { t, locale } = useUserPreferences();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const confirm = async () => {
    if (!confirmation) return;
    setMessage(null);
    try {
      if (confirmation.kind === 'all') await onSignOutAll();
      else {
        const target = confirmation.session;
        await onTerminate(target);
        if (!target.current) {
          const device = target.device === 'mobile' ? t('sessions.mobilePhone') : t('sessions.officeWorkstation');
          setMessage({ tone: 'success', text: t('sessions.ended', { device }) });
        }
      }
      setConfirmation(null);
    } catch (caught) {
      setConfirmation(null);
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('sessions.error') });
    }
  };

  const confirmationText = confirmation?.kind === 'all'
    ? t('sessions.confirmAllText')
    : confirmation?.session.current
      ? t('sessions.confirmCurrentText')
      : t('sessions.confirmOtherText', {
          device: confirmation?.session.device === 'mobile' ? t('sessions.mobilePhone') : t('sessions.officeWorkstation'),
        });

  return (
    <section className={`${styles.settingsCard} ${styles.sessionCard}`} aria-labelledby="active-sessions-title">
      <div className={styles.sessionHeader}>
        <div className={styles.sectionTitle}>
          <span><MonitorSmartphone size={19} aria-hidden="true" /></span>
          <div><p>{t('sessions.eyebrow')}</p><h2 id="active-sessions-title">{t('sessions.title')}</h2></div>
        </div>
        <button className={styles.dangerButton} type="button" onClick={() => setConfirmation({ kind: 'all' })} disabled={busy || sessions.length === 0}>
          <LogOut size={16} aria-hidden="true" /> {t('sessions.signOutAll')}
        </button>
      </div>
      <p className={styles.sectionDescription}>{t('sessions.description')}</p>
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.sessionList}>
        {sessions.map((session) => {
          const DeviceIcon = session.device === 'mobile' ? Smartphone : Laptop;
          const deviceName = session.current
            ? t('sessions.thisDevice')
            : session.device === 'mobile'
              ? t('sessions.mobilePhone')
              : t('sessions.officeWorkstation');
          const location = session.current
            ? t('sessions.currentLocation')
            : session.device === 'mobile'
              ? t('sessions.remoteLocation')
              : t('sessions.officeLocation');
          return (
            <article className={styles.sessionRow} key={session.id}>
              <span className={styles.sessionIcon}><DeviceIcon size={20} aria-hidden="true" /></span>
              <div className={styles.sessionDetails}>
                <div><strong>{deviceName}</strong>{session.current && <span className={styles.currentBadge}><ShieldCheck size={12} aria-hidden="true" /> {t('sessions.current')}</span>}</div>
                <p>{session.deviceDetails} · {location}</p>
                <small>{t('sessions.lastActivity', { time: session.current ? t('sessions.now') : formatDateTime(session.lastActiveAt, locale) })}</small>
              </div>
              <button className={styles.sessionButton} type="button" onClick={() => setConfirmation({ kind: 'single', session })} disabled={busy}>
                {session.current ? t('sessions.signOut') : t('sessions.end')}
              </button>
            </article>
          );
        })}
      </div>

      <Modal
        open={Boolean(confirmation)}
        title={confirmation?.kind === 'all' ? t('sessions.confirmAllTitle') : t('sessions.confirmOneTitle')}
        description={confirmationText}
        onClose={() => { if (!busy) setConfirmation(null); }}
      >
        <div className={styles.confirmationBody}>
          <div className={styles.confirmationIcon}><LogOut size={23} aria-hidden="true" /></div>
          <p>{t('sessions.immediate')}</p>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setConfirmation(null)} disabled={busy}>{t('sessions.cancel')}</button>
            <button className={styles.dangerButton} type="button" onClick={() => void confirm()} disabled={busy}>{busy ? t('sessions.signingOut') : t('sessions.confirm')}</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
