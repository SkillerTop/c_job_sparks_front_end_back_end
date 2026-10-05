import { BriefcaseBusiness, Building2, Camera, LockKeyhole, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { Department, Employee, Role } from '@/models';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { useShop } from '@/controllers/ShopContext';
import { Feedback } from '@/views/components/common/Feedback';
import styles from '@/views/styles/profile.module.css';

export function EmployeeProfileCard({
  employee,
  department,
  manager,
  role,
  avatarDataUrl,
  busy,
  onUpdateAvatar,
  onRemoveAvatar,
}: {
  employee: Employee;
  department: Department | null;
  manager: Employee | null;
  role: Role;
  avatarDataUrl?: string;
  busy: boolean;
  onUpdateAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
}) {
  const { t } = useUserPreferences();
  const { effects } = useShop();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const details = [
    { label: t('employee.jobTitle'), value: employee.title, icon: BriefcaseBusiness },
    { label: t('employee.department'), value: department?.name ?? t('employee.notAssigned'), icon: Building2 },
    { label: t('employee.role'), value: t(`role.${role}`), icon: ShieldCheck },
    { label: t('employee.manager'), value: manager?.name ?? t('employee.notAssigned'), icon: Users },
  ];

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      await onUpdateAvatar(file);
      setMessage({ tone: 'success', text: t('employee.photoSaved') });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('employee.photoError') });
    }
  };

  const removePhoto = async () => {
    setMessage(null);
    try {
      await onRemoveAvatar();
      setMessage({ tone: 'success', text: t('employee.photoRemoved') });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : t('employee.photoError') });
    }
  };

  return (
    <section className={styles.identityCard} aria-labelledby="employee-profile-title">
      <div className={styles.identityLead}>
        <div className={styles.photoEditor}>
          <div className={styles.profilePhoto} data-profile-avatar role="img" aria-label={t('employee.photoAlt', { name: employee.name })}>
            {avatarDataUrl ? <img src={avatarDataUrl} alt="" /> : <span>{employee.initials}</span>}
          </div>
          <input
            ref={fileInput}
            className={styles.srOnly}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void handlePhoto(event)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className={styles.photoActions}>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Camera size={15} aria-hidden="true" /> {busy ? t('employee.uploading') : t('employee.changePhoto')}
            </button>
            {avatarDataUrl && (
              <button type="button" onClick={() => void removePhoto()} disabled={busy}>
                <Trash2 size={14} aria-hidden="true" /> {t('employee.removePhoto')}
              </button>
            )}
          </div>
          <small className={styles.photoHint}>{t('employee.photoHint')}</small>
        </div>
        <div className={styles.identityName}>
          <p className={styles.eyebrow}>{t('employee.eyebrow')}</p>
          <h2 id="employee-profile-title">{employee.name}</h2>
          <p>{employee.title}</p>
          {(effects.signatureBadge || effects.vipStatus) && (
            <div className={styles.activeProfileEffects} aria-label="Active profile rewards">
              {effects.signatureBadge && <span>Signature badge</span>}
              {effects.vipStatus && <span>VIP</span>}
            </div>
          )}
          {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
        </div>
      </div>

      <dl className={styles.identityDetails}>
        <div>
          <dt><UserRound size={16} aria-hidden="true" /> {t('employee.fullName')}</dt>
          <dd>{employee.name}</dd>
        </div>
        {details.map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <dt><Icon size={16} aria-hidden="true" /> {label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.adminNotice}>
        <LockKeyhole size={17} aria-hidden="true" />
        <p><strong>{t('employee.adminManaged')}</strong><span>{t('employee.adminExplanation')}</span></p>
      </div>
    </section>
  );
}
