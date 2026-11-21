import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Folder, type ListSummary, type User } from './api';

interface AppData {
  me: User | null;
  lists: ListSummary[];
  folders: Folder[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

/** The caller's lists and folders: the sidebar and several pages need them. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<User | null>(null);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // `me` first: it creates the user row and Inbox on first sign-in.
      const user = await api.me();
      const [l, f] = await Promise.all([api.listLists(), api.listFolders()]);
      setMe(user);
      setLists(l);
      setFolders(f);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ me, lists, folders, loading, error, refresh }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}
