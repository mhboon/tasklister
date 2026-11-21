import { Navigate, Route, Routes } from 'react-router-dom';
import { AppDataProvider, useAppData } from './lib/AppData';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ListPage } from './pages/ListPage';
import { AgendaPage } from './pages/AgendaPage';
import { PriorityPage } from './pages/PriorityPage';
import { RecurringPage } from './pages/RecurringPage';
import { UsersPage } from './pages/UsersPage';
import { SharePage } from './pages/SharePage';
import { AccountPage } from './pages/AccountPage';

function Home() {
  const { lists, loading } = useAppData();
  if (loading) return <p className="muted pad">Loading…</p>;
  // Guests have no Inbox: send them to their first shared list.
  const first = lists.find((l) => l.isInbox) ?? lists[0];
  return first ? (
    <Navigate to={`/lists/${first.listId}`} replace />
  ) : (
    <p className="pad muted">No lists are shared with you yet. Ask an admin to share one.</p>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppDataProvider>
              <Layout />
            </AppDataProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="lists/:listId" element={<ListPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="priority" element={<PriorityPage />} />
        <Route path="recurring" element={<ProtectedRoute requireAdmin><RecurringPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />
        <Route path="share" element={<SharePage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
