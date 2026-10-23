import { useCallback, useEffect, useRef, useState } from "react";
import type { JobDto } from "../../shared/api-types";
import { api, post, tzOffset } from "./api";

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
 * Resolves colour tokens (a comma-separated list) to concrete colours, for chart libraries that
 * take colours as props. Reading a token directly would return the unresolved light-dark(...)
 * text, so each is applied to a probe element and read back as a computed colour.
 */
export function useCssVars(names: string): Record<string, string> {
  const read = useCallback(() => {
    const probe = document.body.appendChild(document.createElement("span"));
    const resolved = names.split(",").map((name) => {
      probe.style.color = `var(${name})`;
      return [name, getComputedStyle(probe).color];
    });
    probe.remove();
    return Object.fromEntries(resolved);
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

/** Starts a background job with a POST (sending the browser's timezone) and follows it to the end. */
export function useStartJob(onDone: (job: JobDto) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const job = useJob(jobId, onDone);
  const start = (path: string, body: object) => {
    setError(null);
    setJobId(null);
    post<{ job: JobDto }>(path, { ...body, tz: tzOffset() })
      .then((r) => setJobId(r.job.id))
      .catch(setError);
  };
  const running = job !== null && !["completed", "failed"].includes(job.status);
  return { job, error, start, running: running || (jobId !== null && job === null) };
}
