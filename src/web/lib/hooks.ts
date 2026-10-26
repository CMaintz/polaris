import { useCallback, useEffect, useRef, useState } from "react";
import type { JobDto } from "../../shared/api-types";
import { api } from "./api";

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

const FINISHED = new Set(["completed", "failed"]);

/** Polls a background job until it finishes, then calls `onDone` once. */
export function useJob(jobId: string | null, onDone?: (job: JobDto) => void): JobDto | null {
  const [job, setJob] = useState<JobDto | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!jobId) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      let next: JobDto;
      try {
        next = (await api<{ job: JobDto }>(`/jobs/${jobId}`)).job;
      } catch {
        // A failed poll (network blip, restart) must not end polling; try again shortly.
        if (!stopped) timer = setTimeout(poll, 3000);
        return;
      }
      if (stopped) return;
      setJob(next);
      if (FINISHED.has(next.status)) done.current?.(next);
      else timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  return job;
}

/**
 * Reads CSS custom properties (a comma-separated list) for chart libraries that take colours
 * as props, re-reading when the colour scheme changes.
 */
export function useCssVars(names: string): Record<string, string> {
  const read = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.split(",").map((n) => [n, style.getPropertyValue(n).trim()]));
  }, [names]);
  const [vars, setVars] = useState(read);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setVars(read());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [read]);
  return vars;
}
