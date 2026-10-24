import { type FormEvent, useRef } from "react";
import type { ImportFileReportDto, JobDto } from "../../../shared/api-types";
import { formatDate } from "../../lib/format";
import { useResource, useStartJob } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { ResourceView } from "../resource";
import { ErrorBox, JobLine } from "../ui";

export function Imports() {
  const { refreshStatus } = useSession();
  const history = useResource<{ jobs: JobDto[] }>("/jobs?type=import");
  const { job, error, start, running } = useStartJob(() => {
    refreshStatus();
    history.reload();
  });
  return (
    <section className="card stack">
      <h2>Import LinkedIn data</h2>
      <ImportSteps />
      <ImportForm running={running} start={start} />
      <ErrorBox error={error} />
      <JobLine job={job} />
      {job?.status === "completed" && (
        <ImportReport files={(job.result as { files: ImportFileReportDto[] }).files} />
      )}
      <ResourceView resource={history}>{(data) => <ImportHistory jobs={data.jobs} />}</ResourceView>
    </section>
  );
}

function ImportSteps() {
  return (
    <ol className="small secondary" style={{ margin: 0, paddingLeft: 18 }}>
      <li>
        <strong>Posts:</strong> on LinkedIn, open Settings, Data privacy, Get a copy of your data.
        Choose the archive that includes posts (shares). Upload the ZIP, or Shares.csv and
        Profile.csv from it.
      </li>
      <li>
        <strong>Metrics and audience:</strong> open your post analytics (Analytics, Content), pick
        the longest period, and use Export. Upload the .xlsx file.
      </li>
      <li>
        Import again whenever you like: nothing is duplicated, and newer figures are added to the
        history.
      </li>
    </ol>
  );
}

function ImportForm({
  running,
  start,
}: {
  running: boolean;
  start: (path: string, body?: FormData) => void;
}) {
  const { status } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const upload = (e: FormEvent) => {
    e.preventDefault();
    const files = input.current?.files;
    if (!files?.length) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append("files", file);
    start("/imports", form);
    if (input.current) input.current.value = "";
  };
  return (
    <form className="row" onSubmit={upload}>
      <input
        ref={input}
        type="file"
        multiple
        accept=".zip,.csv,.xlsx"
        aria-label="LinkedIn export files"
      />
      <button className="btn primary" disabled={running}>
        Import
      </button>
      {!status?.hasLinkedInData && !status?.hasDemoData && (
        <button
          type="button"
          className="btn"
          disabled={running}
          onClick={() => start("/imports/demo")}
        >
          Load demo data instead
        </button>
      )}
    </form>
  );
}

function ImportReport({ files }: { files: ImportFileReportDto[] }) {
  return (
    <ul className="small">
      {files.map((f) => (
        <li key={f.file}>
          <strong>{f.file}</strong>: {f.postsCreated} new posts, {f.postsUpdated} updated,{" "}
          {f.metricSnapshots} metric snapshots, {f.accountDays} days of account metrics,{" "}
          {f.audienceSegments} audience segments.
          {f.warnings.length > 0 && (
            <ul className="muted">
              {f.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImportHistory({ jobs }: { jobs: JobDto[] }) {
  if (jobs.length === 0) return null;
  return (
    <details>
      <summary>Import history ({jobs.length})</summary>
      <table>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="small">{formatDate(j.createdAt, true)}</td>
              <td className="small">{j.label}</td>
              <td className="small">
                {j.status}
                {j.error && `: ${j.error}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
