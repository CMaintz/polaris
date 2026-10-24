import { useEffect, useRef, useState } from "react";
import type { JobDto } from "../../../shared/core-types";
import { api, post, tzOffset, withTimezone } from "../api";

const FINISHED = new Set<JobDto["status"]>(["completed", "failed"]);
const isFinished = (job: JobDto | null) => job !== null && FINISHED.has(job.status);

/** Polls a background job until it finishes, then calls `onDone` once. */
function useJob(jobId: string | null, onDone?: (job: JobDto) => void): JobDto | null {
  // Keyed by job id, so a new job never shows the previous job's result before its first poll.
  const [polled, setPolled] = useState<JobDto | null>(null);
  const job = polled?.id === jobId ? polled : null;
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
      setPolled(next);
      if (isFinished(next)) done.current?.(next);
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

export interface StartedJob {
  job: JobDto | null;
  error: Error | null;
  start: (path: string, body?: object | FormData) => void;
  running: boolean;
}

/**
 * Every job start sends the browser's timezone, which posting-time buckets need. `running`
 * covers the start request too, so a slow upload cannot be started twice.
 */
export function useStartJob(onDone: (job: JobDto) => void): StartedJob {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const job = useJob(jobId, onDone);
  const start = (path: string, body: object | FormData = {}) => {
    setError(null);
    setJobId(null);
    setStarting(true);
    post<{ job: JobDto }>(path, withTimezone(body, tzOffset()))
      .then((r) => setJobId(r.job.id))
      .catch(setError)
      .finally(() => setStarting(false));
  };
  const polling = jobId !== null && !isFinished(job);
  return { job, error, start, running: starting || polling };
}
