import { BriefcaseBusiness, Building2, LockKeyhole, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { Department, Employee, Role } from '@/models';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { useSpark } from '@/controllers/SparkContext';
import { EMPTY_SHOP_EFFECTS } from '@/models/shop';
import styles from '@/views/styles/profile.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function EmployeeProfileCard({
  employee,
  department,
  managerName,
  role,
  avatarDataUrl,
}: {
  employee: Employee;
  department: Department | null;
  managerName: string | null;
  role: Role;
  avatarDataUrl?: string;
}) {
  const { t, localize } = useUserPreferences();
  const { snapshot } = useSpark();
  const effects = snapshot?.shopEffects ?? EMPTY_SHOP_EFFECTS;
  const details = [
    { label: t('employee.jobTitle'), value: employee.title, icon: BriefcaseBusiness },
    { label: t('employee.department'), value: department?.name ?? t('employee.notAssigned'), icon: Building2 },
    { label: t('employee.role'), value: t(`role.${role}`), icon: ShieldCheck },
    { label: t('employee.manager'), value: managerName ?? t('employee.notAssigned'), icon: Users },
  ];

  return (
    <section className={styles.identityCard} aria-labelledby="employee-profile-title">
      <div className={styles.identityLead}>
        <div className={styles.photoEditor}>
          <div className={styles.profilePhoto} data-profile-avatar role="img" aria-label={t('employee.photoAlt', { name: employee.name })}>
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="" width="74" height="74" decoding="async" />
            ) : <span>{employee.initials}</span>}
          </div>
          <small className={styles.photoHint}>{t('employee.photoManaged')}</small>
        </div>
        <div className={styles.identityName}>
          <p className={styles.eyebrow}>{t('employee.eyebrow')}</p>
          <h2 id="employee-profile-title">{employee.name}</h2>
          <p>{employee.title}</p>
          {(effects.signatureBadge || effects.vipStatus) && (
            <div className={styles.activeProfileEffects} aria-label={localize('Active profile rewards')}>
              {effects.signatureBadge && <span><LocalizedText>Signature badge</LocalizedText></span>}
              {effects.vipStatus && <span><LocalizedText>VIP</LocalizedText></span>}
            </div>
          )}
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
