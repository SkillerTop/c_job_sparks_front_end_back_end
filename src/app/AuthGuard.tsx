import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/controllers/AuthContext';

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user)
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  return <Outlet />;
}

export function GuestOnly() {
  const { user } = useAuth();
  return user ? <Navigate replace to="/" /> : <Outlet />;
}
