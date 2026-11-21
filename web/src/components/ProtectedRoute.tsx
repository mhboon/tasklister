import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';

export function ProtectedRoute({ children, requireAdmin = false, requireWork = false }: { children: ReactNode; requireAdmin?: boolean; requireWork?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (requireAdmin && !user.isAdmin) return <p className="pad">This page is for admins.</p>;
  if (requireWork && !user.canWork) return <p className="pad">This page is not available to guests.</p>;
  return <>{children}</>;
}
