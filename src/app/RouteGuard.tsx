import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSpark } from '@/controllers/SparkContext';
import type { Role } from '@/models';

export function RouteGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { activeRole } = useSpark();
  const location = useLocation();
  if (!roles.includes(activeRole))
    return <Navigate replace to="/forbidden" state={{ from: location.pathname }} />;
  return children;
}
