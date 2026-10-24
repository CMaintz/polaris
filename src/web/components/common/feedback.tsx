import type { JobDto } from "../../../shared/core-types";
import type { StartedJob } from "../../lib/hooks/job";

function Loading() {
  return <p className="muted">Loading...</p>;
}

export function ErrorBox({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div className="banner error" role="alert">
      {error.message}
    </div>
  );
}

/** What a page shows before its first load: the error if it failed, "Loading..." otherwise. */
export function Pending({ error }: { error: Error | null }) {
  return error ? <ErrorBox error={error} /> : <Loading />;
}

const JOB_STATUS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  retrying: "Retrying after an error",
  completed: "Done",
  failed: "Failed",
};

export function JobLine({ job }: { job: JobDto | null }) {
  if (!job) return null;
  const pct = Math.round(job.progress * 100);
  return (
    <div className="small" role="status">
      <strong>{JOB_STATUS[job.status] ?? job.status}</strong>
      {job.label && ` - ${job.label}`}
      {job.status === "running" && pct > 0 && ` (${pct}%)`}
      {job.error && <span className="muted"> - {job.error}</span>}
    </div>
  );
}

/** A started job's start error and its progress line. */
export function JobStatus({ job }: { job: StartedJob }) {
  return (
    <>
      <ErrorBox error={job.error} />
      <JobLine job={job.job} />
    </>
  );
}
