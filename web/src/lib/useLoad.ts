import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data on mount and whenever `key` changes. `reload` re-fetches,
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

  return { data, setData, error, setError, loading, reload };
}
