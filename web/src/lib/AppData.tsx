import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Folder, type ListSummary, type User } from './api';

interface AppData {
  me: User | null;
  lists: ListSummary[];
  folders: Folder[];
  /** Where items can be emailed to; null when email is not set up. */
  mailDomain: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Re-pulls the navigation and tells the open page to re-fetch its data too. */
  refreshAll: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);
const EpochCtx = createContext(0);

/** Bumps whenever everything on screen should be re-fetched; see useLoad. */
// eslint-disable-next-line react-refresh/only-export-components
export const useRefreshEpoch = () => useContext(EpochCtx);

/** A phone app resumed from the background should not need a manual refresh, but not on every blip either. */
const RESUME_REFRESH_MIN_MS = 15_000;

/** The caller's lists and folders: the sidebar and several pages need them. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<User | null>(null);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [mailDomain, setMailDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const lastRefresh = useRef(0);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    try {
      // `me` first: it creates the user row and Inbox on first sign-in.
      const user = await api.me();
      const [l, f, m] = await Promise.all([api.listLists(), api.listFolders(), api.mailDomain().catch(() => null)]);
      setMe(user);
      setLists(l);
      setFolders(f);
      setMailDomain(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setEpoch((n) => n + 1);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // An installed iPhone app stays alive in the background and resumes without
  // reloading, so a list shared meanwhile would never show up.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > RESUME_REFRESH_MIN_MS) refreshAll();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [refreshAll]);

  return (
    <Ctx.Provider value={{ me, lists, folders, mailDomain, loading, error, refresh, refreshAll }}>
      <EpochCtx.Provider value={epoch}>{children}</EpochCtx.Provider>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}
