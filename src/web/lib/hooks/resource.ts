import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export interface Resource<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads a GET endpoint. On reload the previous data stays on screen until the new data
 * arrives, so refreshes never flash an empty state.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T | null; error: Error | null }>({
    key: null,
    data: null,
    error: null,
  });
  const key = path === null ? null : `${path}#${version}`;

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((error: Error) => !cancelled && setState((s) => ({ ...s, key, error })));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: state.data,
    error: state.error,
    loading: key !== null && state.key !== key,
    reload,
  };
}
