import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { Role } from '@/models';
import type { TranslationKey } from '@/constants/translations';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { useShop } from '@/controllers/ShopContext';
import { ThemeToggle } from './ThemeToggle';
import { UserAvatar } from '@/views/components/profile/UserAvatar';
import styles from '@/views/styles/app.module.css';

export function AccountMenu({
  name,
  initials,
  avatarDataUrl,
  role,
  department,
  onSignOut,
}: {
  name: string;
  initials: string;
  avatarDataUrl?: string;
  role: Role;
  department: string;
  onSignOut: () => void;
}) {
  const { t } = useUserPreferences();
  const { effects } = useShop();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.accountMenu} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.accountMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('shell.accountMenu')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <UserAvatar name={name} initials={initials} src={avatarDataUrl} />
      </button>
      {open && (
        <div className={styles.accountPopover} role="dialog" aria-label={t('shell.account')}>
          <header>
            <UserAvatar name={name} initials={initials} src={avatarDataUrl} size="large" />
            <span>
              <strong>{name}</strong>
              <small>{t(`role.${role}` as TranslationKey)} · {department}</small>
              {(effects.signatureBadge || effects.vipStatus) && (
                <span className={styles.accountEffectBadges} aria-label="Active profile rewards">
                  {effects.signatureBadge && <em>Signature</em>}
                  {effects.vipStatus && <em>VIP</em>}
                </span>
              )}
            </span>
          </header>
          <NavLink to="/profile" onClick={() => setOpen(false)}>
            <Settings2 size={17} aria-hidden="true" /> {t('shell.profileSettings')}
          </NavLink>
          <ThemeToggle variant="menu" />
          <button type="button" className={styles.accountSignOut} onClick={onSignOut}>
            <LogOut size={17} aria-hidden="true" /> {t('shell.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
