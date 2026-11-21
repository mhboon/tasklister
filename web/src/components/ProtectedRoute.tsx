import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !user.isAdmin) return <p className="pad">This page is for admins.</p>;
  return <>{children}</>;
}
