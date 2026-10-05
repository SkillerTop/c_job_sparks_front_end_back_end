import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  Bell,
  BookOpen,
  CircleGauge,
  Flame,
  Home,
  Menu,
  PackageCheck,
  RefreshCcw,
  Settings2,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import type { TranslationKey } from '@/constants/translations';
import {
  COMPANY_ACHIEVEMENT_ROLES,
  MEMBER_WORKSPACE_ROLES,
  PEER_RECOGNITION_ROLES,
  SHOP_ROLES,
} from '@/constants/app';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';
import { useShop } from '@/controllers/ShopContext';
import type { Role } from '@/models';
import { selectPendingDepartmentDisenchantRequests, selectPendingRequests } from '@/models/selectors';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { Modal } from '@/views/components/common/Modal';
import { EmptyState } from '@/views/components/common/EmptyState';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { BrandLockup } from '@/views/components/common/BrandLockup';
import { AppFooter } from './AppFooter';
import { AccountMenu } from './AccountMenu';
import { BackToTop } from './BackToTop';
import { CompactBalanceMenu } from './CompactBalanceMenu';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

type NavItem = { labelKey: TranslationKey; path: string; icon: typeof Home; roles?: Role[]; badge?: number };

const baseItems: NavItem[] = [
  { labelKey: 'nav.home', path: '/', icon: Home, roles: MEMBER_WORKSPACE_ROLES },
  { labelKey: 'nav.mySparks', path: '/sparks', icon: WalletCards, roles: MEMBER_WORKSPACE_ROLES },
  {
    labelKey: 'nav.peerRecognition',
    path: '/recognition',
    icon: Star,
    roles: PEER_RECOGNITION_ROLES,
  },
  {
    labelKey: 'nav.achievements',
    path: '/achievements',
    icon: Award,
    roles: MEMBER_WORKSPACE_ROLES,
  },
  { labelKey: 'nav.shop', path: '/shop', icon: ShoppingBag, roles: SHOP_ROLES },
  { labelKey: 'nav.inventory', path: '/inventory', icon: PackageCheck, roles: MEMBER_WORKSPACE_ROLES },
  {
    labelKey: 'nav.convert',
    path: '/convert',
    icon: RefreshCcw,
    roles: MEMBER_WORKSPACE_ROLES,
  },
  {
    labelKey: 'nav.disenchant',
    path: '/disenchant',
    icon: Flame,
    roles: MEMBER_WORKSPACE_ROLES,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { snapshot, currentUserId, activeRole } = useSpark();
  const { balances: shopBalances, loading: shopLoading } = useShop();
  const { accounts, logout } = useAuth();
  const { preferences, t } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  useDialogFocus(open, drawer, () => setOpen(false));
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeDrawer = () => {
      if (desktop.matches) setOpen(false);
    };
    closeDrawer();
    desktop.addEventListener('change', closeDrawer);
    return () => desktop.removeEventListener('change', closeDrawer);
  }, []);
  const user = snapshot!.employees.find((employee) => employee.id === currentUserId)!;
  const department = snapshot!.departments.find((item) => item.id === user.departmentId)!;
  const pendingRequests = selectPendingRequests(snapshot!, currentUserId, activeRole);
  const pendingDisenchantRequests = selectPendingDepartmentDisenchantRequests(
    snapshot!,
    currentUserId,
    activeRole,
  );
  const pendingRegistrations =
    activeRole === 'Administrator'
      ? accounts.filter((account) => account.source === 'Registration' && account.status === 'Pending')
      : [];
  const pendingApprovals = pendingRequests.recognitions.length + pendingRequests.awards.length;
  const pending = pendingApprovals + pendingDisenchantRequests.length + pendingRegistrations.length;
  const roleItems = useMemo<NavItem[]>(() => {
    if (activeRole === 'Administrator')
      return [
        { labelKey: 'nav.adminSettings', path: '/admin', icon: Settings2, badge: pendingRegistrations.length },
        { labelKey: 'nav.companyAchievements', path: '/company-achievements', icon: Trophy },
      ];
    const items: NavItem[] = [];
    if (['Coordinator', 'GPM', 'Head'].includes(activeRole))
      items.push({
        labelKey:
          activeRole === 'GPM'
            ? 'nav.companyTeam'
            : activeRole === 'Coordinator'
              ? 'nav.departmentTeam'
              : 'nav.departmentWorkspace',
        path: '/team',
        icon: Users,
        badge: activeRole === 'Head' ? pendingDisenchantRequests.length : undefined,
      });
    if (['Coordinator', 'GPM', 'Head', 'Top Management'].includes(activeRole))
      items.push({
        labelKey: activeRole === 'Top Management' ? 'nav.radiantAward' : 'nav.awardSpark',
        path: '/award',
        icon: Sparkles,
      });
    if (activeRole === 'Head')
      items.unshift({ labelKey: 'nav.approvalCenter', path: '/approvals', icon: ShieldCheck, badge: pendingApprovals });
    if (COMPANY_ACHIEVEMENT_ROLES.includes(activeRole))
      items.push({ labelKey: 'nav.companyAchievements', path: '/company-achievements', icon: Trophy });
    return items;
  }, [activeRole, pendingApprovals, pendingDisenchantRequests.length, pendingRegistrations.length]);
  const visibleBase = baseItems.filter((item) => !item.roles || item.roles.includes(activeRole));

  const navigation = (
    <>
      <NavLink className={styles.brand} to="/" aria-label="C-Job Sparks home" onClick={() => setOpen(false)}>
        <BrandLockup />
        <span className={styles.brandProduct}>{t('shell.brandPurpose')}</span>
      </NavLink>
      <nav className={styles.nav} aria-label={t('shell.primaryNavigation')}>
        {visibleBase.length > 0 && <p className={styles.navLabel}>{t('nav.workspace')}</p>}
        {visibleBase.map(({ labelKey, path, icon: Icon }) => (
          <NavLink
            end={path === '/'}
            className={({ isActive }) => (isActive ? styles.navActive : styles.navLink)}
            to={path}
            key={path}
            onClick={() => setOpen(false)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
        {roleItems.length > 0 && (
          <p className={styles.navLabelSecondary}>
            {t(activeRole === 'Administrator' ? 'nav.system' : 'nav.roleTools')}
          </p>
        )}
        {roleItems.map(({ labelKey, path, icon: Icon, badge }) => (
          <NavLink
            className={({ isActive }) => (isActive ? styles.navActive : styles.navLink)}
            to={path}
            key={path}
            onClick={() => setOpen(false)}
          >
            {path === '/award' && activeRole === 'Top Management' ? (
              <SparkIcon type="Radiant" size={21} />
            ) : (
              <Icon size={18} strokeWidth={1.8} />
            )}
            <span>{t(labelKey)}</span>
            {badge ? <small className={styles.navBadge}>{badge}</small> : null}
          </NavLink>
        ))}
      </nav>
      <div className={styles.sidebarFooter}>
        {MEMBER_WORKSPACE_ROLES.includes(activeRole) && (
          <NavLink
            className={({ isActive }) => (isActive ? styles.rulesLinkActive : styles.rulesLink)}
            to="/rules"
            onClick={() => setOpen(false)}
          >
            <BookOpen size={17} />
            <span>{t('nav.rules')}</span>
          </NavLink>
        )}
        <div className={styles.quarterBadge}>
          <span /> {snapshot!.settings.currentQuarter}
        </div>
        <p>{t('shell.sidebarPurpose')}</p>
      </div>
    </>
  );

  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        {t('shell.skip')}
      </a>
      <aside className={styles.sidebar}>{navigation}</aside>
      {open && (
        <>
          <div className={styles.mobileBackdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            ref={drawer}
            id="mobile-navigation"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t('shell.navigation')}
            className={`${styles.mobileDrawer} ${styles.mobileDrawerOpen}`}
          >
            <button
              className={styles.drawerClose}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('shell.closeNavigation')}
            >
              <X size={20} />
            </button>
            {navigation}
          </aside>
        </>
      )}
      <div className={styles.appMain} inert={open}>
        <header className={styles.topbar}>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('shell.openNavigation')}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            <Menu size={20} />
          </button>
          <div className={styles.contextPill}>
            <CircleGauge size={15} />
            <span>{t(`roleDescription.${activeRole}` as TranslationKey)}</span>
          </div>
          <div className={styles.topbarRight}>
            {MEMBER_WORKSPACE_ROLES.includes(activeRole) && (
              <CompactBalanceMenu balances={shopBalances} loading={shopLoading} />
            )}
            <button
              className={`${styles.iconButton} ${pending > 0 ? styles.notificationButtonActive : ''}`}
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={t('shell.notifications', { count: pending })}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
            >
              <Bell className={styles.notificationBell} size={19} aria-hidden="true" focusable="false" />
              {pending > 0 && <span className={styles.notificationDot} aria-hidden="true" />}
            </button>
            <AccountMenu
              name={user.name}
              initials={user.initials}
              avatarDataUrl={preferences?.avatarDataUrl}
              role={activeRole}
              department={department.name}
              onSignOut={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            />
          </div>
        </header>
        <main className={styles.mainContent} id="main-content" tabIndex={-1}>
          {children}
        </main>
        <AppFooter />
        <BackToTop />
      </div>
      <Modal
        open={notificationsOpen}
        title={t('shell.notificationTitle')}
        description={
          activeRole === 'Administrator'
            ? t('shell.notificationAdmin')
            : activeRole === 'Head'
            ? t('shell.notificationHead')
            : t('shell.notificationEmployee')
        }
        onClose={() => setNotificationsOpen(false)}
      >
        {pending === 0 ? (
          <EmptyState title={t('shell.upToDate')} description={t('shell.noPending')} />
        ) : (
          <div className={styles.requestList}>
            {pendingRegistrations.map((account) => (
              <article key={account.id}>
                <div>
                  <strong>{t('shell.registrationRequest')}</strong>
                  <p>{account.email}</p>
                  <NavLink
                    className={styles.textLink}
                    to="/admin?tab=access"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    {t('shell.reviewAccess')}
                  </NavLink>
                </div>
                <StatusBadge status="Pending" />
              </article>
            ))}
            {pendingRequests.recognitions.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.category}</strong>
                  <p>{t('shell.forEmployee', { name: snapshot!.employees.find((employee) => employee.id === item.recipientId)?.name ?? '' })}</p>
                  <NavLink
                    className={styles.textLink}
                    to={activeRole === 'Head' ? '/approvals' : '/recognition'}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    {t('shell.openRecognition')}
                  </NavLink>
                </div>
                <StatusBadge status="Pending" />
              </article>
            ))}
            {pendingRequests.awards.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.category}</strong>
                  <p>
                    {item.amount} {item.sparkType} ·{' '}
                    {snapshot!.employees.find((employee) => employee.id === item.employeeId)?.name}
                  </p>
                  <NavLink
                    className={styles.textLink}
                    to={activeRole === 'Head' ? '/approvals' : '/award'}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    {t('shell.openAward')}
                  </NavLink>
                </div>
                <StatusBadge status="Pending" />
              </article>
            ))}
            {pendingDisenchantRequests.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{t('shell.disenchantRequest')}</strong>
                  <p>
                    {item.amount} {item.sparkType} ·{' '}
                    {snapshot!.employees.find((employee) => employee.id === item.employeeId)?.name}
                  </p>
                  <NavLink
                    className={styles.textLink}
                    to="/team#department-disenchant-requests"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    {t('shell.openDepartmentWorkspace')}
                  </NavLink>
                </div>
                <StatusBadge status={item.status} />
              </article>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
