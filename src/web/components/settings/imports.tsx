import { type FormEvent, useRef } from "react";
import type { ImportFileReportDto, JobDto } from "../../../shared/api-types";
import { PLATFORM_NAMES } from "../../lib/accounts";
import { formatDate } from "../../lib/format";
import { useResource, useStartJob } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { ResourceView } from "../resource";
import { ErrorBox, JobLine } from "../ui";

export function Imports() {
  const { refreshStatus, status } = useSession();
  const linkedin = (status?.account?.platform ?? "linkedin") === "linkedin";
  const history = useResource<{ jobs: JobDto[] }>("/jobs?type=import");
  const { job, error, start, running } = useStartJob(() => {
    refreshStatus();
    history.reload();
  });
  return (
    <section className="card stack">
      <h2>Import data</h2>
      <ImportTarget />
      {linkedin ? <ImportSteps /> : <GenericSteps />}
      <ImportForm running={running} start={start} linkedin={linkedin} />
      <ErrorBox error={error} />
      <JobLine job={job} />
      {job?.status === "completed" && (
        <ImportReport files={(job.result as { files: ImportFileReportDto[] }).files} />
      )}
      <ResourceView resource={history}>{(data) => <ImportHistory jobs={data.jobs} />}</ResourceView>
    </section>
  );
}

function ImportTarget() {
  const { status } = useSession();
  const account = status?.account;
  return (
    <p className="small">
      Importing into{" "}
      <strong>
        {account
          ? `${account.label} (${PLATFORM_NAMES[account.platform]})`
          : "a new LinkedIn account"}
      </strong>
      . Files that fit: {status?.accepts.map((a) => `${a.label} (${a.files})`).join("; ")}.
    </p>
  );
}

function GenericSteps() {
  return (
    <p className="small secondary" style={{ margin: 0 }}>
      Export your posts from the platform as a CSV with a header row. Required columns: date, text.
      Optional: url, type, impressions, reactions, comments, reposts, engagements, hashtags. A file
      is read as the complete list of posts for the days it covers. Import again whenever you like:
      posts are matched by url, or by date and text, so nothing is duplicated.
    </p>
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
  linkedin,
}: {
  running: boolean;
  start: (path: string, body?: FormData) => void;
  linkedin: boolean;
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
        accept={linkedin ? ".zip,.csv,.xlsx" : ".csv"}
        aria-label="Files to import"
      />
      <button className="btn primary" disabled={running}>
        Import
      </button>
      {linkedin && !status?.hasLinkedInData && !status?.hasDemoData && (
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
