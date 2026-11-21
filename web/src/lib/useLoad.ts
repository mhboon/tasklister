import { useCallback, useEffect, useRef, useState } from 'react';
import { useRefreshEpoch } from './AppData';

/**
 * Loads data on mount and whenever `key` changes, and quietly re-fetches when
 * the app asks for everything to be refreshed. `reload` re-fetches,
 * `setData` patches the loaded data locally after a mutation.
 */
export function useLoad<T>(fetcher: () => Promise<T>, key = '') {
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    reload();
  }, [reload, key]);

  const epoch = useRefreshEpoch();
  const seenEpoch = useRef(epoch);
  useEffect(() => {
    if (seenEpoch.current === epoch) return;
    seenEpoch.current = epoch;
    reload(); // keeps the current data on screen meanwhile
  }, [epoch, reload]);

  return { data, setData, error, setError, loading, reload };
}
