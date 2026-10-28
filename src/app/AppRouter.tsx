import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCcw, Sparkles } from 'lucide-react';
import {
  COMPANY_ACHIEVEMENT_ROLES,
  MEMBER_WORKSPACE_ROLES,
  PERSONAL_ECONOMY_ROLES,
  PERSONAL_LEDGER_ROLES,
  PEER_RECOGNITION_ROLES,
  PERFORMANCE_ROLES,
  SHOP_ROLES,
} from '@/constants/app';
import { useAuth } from '@/controllers/AuthContext';
import { useSpark } from '@/controllers/SparkContext';
import { AppShell } from '@/views/components/layout/AppShell';
import { AsyncBoundary } from '@/views/components/common/AsyncBoundary';
import { RouteGuard } from './RouteGuard';
import { GuestOnly, RequireAuth } from './AuthGuard';
import { RouteMetadata } from './RouteMetadata';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


const DashboardPage = lazy(() => import('@/views/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ProfilePage = lazy(() => import('@/views/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const MySparksPage = lazy(() => import('@/views/pages/MySparksPage').then((module) => ({ default: module.MySparksPage })));
const RecognitionPage = lazy(() => import('@/views/pages/RecognitionPage').then((module) => ({ default: module.RecognitionPage })));
const AchievementsPage = lazy(() => import('@/views/pages/AchievementsPage').then((module) => ({ default: module.AchievementsPage })));
const CompanyAchievementsPage = lazy(() =>
  import('@/views/pages/CompanyAchievementsPage').then((module) => ({ default: module.CompanyAchievementsPage })),
);
const ShopPage = lazy(() => import('@/views/pages/ShopPage').then((module) => ({ default: module.ShopPage })));
const InventoryPage = lazy(() => import('@/views/pages/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const ConversionPage = lazy(() => import('@/views/pages/ConversionPage').then((module) => ({ default: module.ConversionPage })));
const DisenchantPage = lazy(() => import('@/views/pages/DisenchantPage').then((module) => ({ default: module.DisenchantPage })));
const AwardPage = lazy(() => import('@/views/pages/AwardPage').then((module) => ({ default: module.AwardPage })));
const ApprovalsPage = lazy(() => import('@/views/pages/ApprovalsPage').then((module) => ({ default: module.ApprovalsPage })));
const TeamPage = lazy(() => import('@/views/pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const AdminPage = lazy(() => import('@/views/pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const RulesPage = lazy(() => import('@/views/pages/RulesPage').then((module) => ({ default: module.RulesPage })));
const ForbiddenPage = lazy(() => import('@/views/pages/ForbiddenPage').then((module) => ({ default: module.ForbiddenPage })));
const NotFoundPage = lazy(() => import('@/views/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const LoginPage = lazy(() => import('@/views/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('@/views/pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const RegistrationStatusPage = lazy(() =>
  import('@/views/pages/RegistrationStatusPage').then((module) => ({ default: module.RegistrationStatusPage })),
);

function RouteLoading() {
  const { pathname } = useLocation();
  const routeKind = pathname.startsWith('/profile')
    ? 'profile'
    : pathname.startsWith('/shop') || pathname.startsWith('/inventory')
      ? 'catalog'
      : pathname.startsWith('/admin')
        ? 'admin'
        : ['/recognition', '/award', '/convert', '/disenchant'].some((path) => pathname.startsWith(path))
          ? 'form'
          : 'overview';
  return (
    <div
      className={styles.routeSkeleton}
      data-route-kind={routeKind}
      role="status"
      aria-live="polite"
    >
      <span className={styles.srOnly}><LocalizedText>Loading workspace section…</LocalizedText></span>
      <div className={styles.routeSkeletonHeading}><span /><span /></div>
      <div className={styles.routeSkeletonGrid}><span /><span /><span /></div>
      <div className={styles.routeSkeletonBody}><span /><span /></div>
    </div>
  );
}

function WorkspaceLayout() {
  const location = useLocation();
  const { currentUserId, snapshot, loading, sectionLoading, error, refresh } = useSpark();
  if (error)
    return (
      <div className={styles.fullState} role="alert">
        <AlertTriangle size={34} />
        <h1><LocalizedText>Workspace unavailable</LocalizedText></h1>
        <p><LocalizedText>{error}</LocalizedText></p>
        <button className={styles.primaryButton} onClick={() => void refresh()} type="button">
          <RefreshCcw size={16} /> <LocalizedText>Try again
        </LocalizedText></button>
      </div>
    );
  if (loading || !snapshot)
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <span className={styles.loadingMark}><Sparkles size={24} /></span>
        <strong><LocalizedText>Loading workspace</LocalizedText></strong>
        <p><LocalizedText>Balances, permissions and company data are being refreshed.</LocalizedText></p>
        <div className={styles.loadingLine}><span /></div>
      </div>
    );
  return (
    <AsyncBoundary>
      <AppShell key={currentUserId}>
        <Suspense fallback={<RouteLoading />}>
          <div key={location.pathname}>
            {sectionLoading ? <RouteLoading /> : <Outlet />}
          </div>
        </Suspense>
      </AppShell>
    </AsyncBoundary>
  );
}

function WorkspaceIndex() {
  const { activeRole } = useSpark();
  if (activeRole === 'Administrator') return <Navigate replace to="/admin" />;
  if (activeRole === 'Top Management') return <Navigate replace to="/award" />;
  return <DashboardPage />;
}

export function AppRouter() {
  const { loading, error, refreshAuth } = useAuth();
  if (loading)
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <span className={styles.loadingMark}><Sparkles size={24} /></span>
        <strong><LocalizedText>Preparing access</LocalizedText></strong>
        <p><LocalizedText>Account status and permissions are loading.</LocalizedText></p>
        <div className={styles.loadingLine}><span /></div>
      </div>
    );
  if (error)
    return (
      <div className={styles.fullState} role="alert">
        <AlertTriangle size={34} />
        <h1><LocalizedText>Sign-in unavailable</LocalizedText></h1>
        <p><LocalizedText>{error}</LocalizedText></p>
        <button className={styles.primaryButton} onClick={() => void refreshAuth()} type="button">
          <RefreshCcw size={16} /> <LocalizedText>Try again
        </LocalizedText></button>
      </div>
    );

  return (
    <>
      <RouteMetadata />
      <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/registration-status" element={<RegistrationStatusPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<WorkspaceLayout />}>
          <Route index element={<WorkspaceIndex />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="sparks"
            element={
              <RouteGuard roles={PERSONAL_LEDGER_ROLES}>
                <MySparksPage />
              </RouteGuard>
            }
          />
          <Route
            path="recognition"
            element={
              <RouteGuard roles={PEER_RECOGNITION_ROLES}>
                <RecognitionPage />
              </RouteGuard>
            }
          />
          <Route
            path="performance"
            element={
              <RouteGuard roles={PERFORMANCE_ROLES}>
                <Navigate replace to="/achievements#performance" />
              </RouteGuard>
            }
          />
          <Route
            path="achievements"
            element={
              <RouteGuard roles={PERSONAL_LEDGER_ROLES}>
                <AchievementsPage />
              </RouteGuard>
            }
          />
          <Route
            path="company-achievements"
            element={
              <RouteGuard roles={COMPANY_ACHIEVEMENT_ROLES}>
                <CompanyAchievementsPage />
              </RouteGuard>
            }
          />
          <Route
            path="shop"
            element={
              <RouteGuard roles={SHOP_ROLES}>
                <ShopPage />
              </RouteGuard>
            }
          />
          <Route
            path="inventory"
            element={
              <RouteGuard roles={PERSONAL_ECONOMY_ROLES}>
                <InventoryPage />
              </RouteGuard>
            }
          />
          <Route
            path="convert"
            element={
              <RouteGuard roles={PERSONAL_ECONOMY_ROLES}>
                <ConversionPage />
              </RouteGuard>
            }
          />
          <Route
            path="disenchant"
            element={
              <RouteGuard roles={PERSONAL_ECONOMY_ROLES}>
                <DisenchantPage />
              </RouteGuard>
            }
          />
          <Route
            path="award"
            element={
              <RouteGuard roles={['Coordinator', 'GPM', 'Head', 'Top Management']}>
                <AwardPage />
              </RouteGuard>
            }
          />
          <Route
            path="approvals"
            element={
              <RouteGuard roles={['Head']}>
                <ApprovalsPage />
              </RouteGuard>
            }
          />
          <Route
            path="team"
            element={
              <RouteGuard roles={['Coordinator', 'GPM', 'Head']}>
                <TeamPage />
              </RouteGuard>
            }
          />
          <Route
            path="admin"
            element={
              <RouteGuard roles={['Administrator']}>
                <AdminPage />
              </RouteGuard>
            }
          />
          <Route path="forbidden" element={<ForbiddenPage />} />
          <Route
            path="rules"
            element={
              <RouteGuard roles={MEMBER_WORKSPACE_ROLES}>
                <RulesPage />
              </RouteGuard>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      </Routes>
      </Suspense>
    </>
  );
}
