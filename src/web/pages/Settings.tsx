import { type FormEvent, useRef, useState } from "react";
import type { JobDto } from "../../shared/api-types";
import { useSession } from "../App";
import { api, del, post, put } from "../lib/api";
import { formatDate } from "../lib/format";
import { useJob, useResource } from "../lib/hooks";
import { ErrorBox, Field, JobLine, PageHead } from "../components/ui";

export function SettingsPage() {
  return (
    <div className="stack">
      <PageHead title="Settings" intro="Your data sources, AI keys and data controls." />
      <Imports />
      <AiKeys />
      <DataControls />
    </div>
  );
}

interface FileReport {
  file: string;
  postsCreated: number;
  postsUpdated: number;
  metricSnapshots: number;
  accountDays: number;
  audienceSegments: number;
  warnings: string[];
}

function Imports() {
  const { status, refreshStatus } = useSession();
  const history = useResource<{ jobs: JobDto[] }>("/jobs?type=import");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const job = useJob(jobId, () => {
    refreshStatus();
    history.reload();
  });
  const start = (request: Promise<{ job: JobDto }>) => {
    setError(null);
    request.then((r) => setJobId(r.job.id)).catch(setError);
  };
  const upload = (e: FormEvent) => {
    e.preventDefault();
    const files = input.current?.files;
    if (!files?.length) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append("files", file);
    start(post<{ job: JobDto }>("/imports", form));
    if (input.current) input.current.value = "";
  };
  return (
    <section className="card stack">
      <h2>Import LinkedIn data</h2>
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
      <form className="row" onSubmit={upload}>
        <input
          ref={input}
          type="file"
          multiple
          accept=".zip,.csv,.xlsx"
          aria-label="LinkedIn export files"
        />
        <button className="btn primary">Import</button>
        {!status?.hasLinkedInData && !status?.hasDemoData && (
          <button
            type="button"
            className="btn"
            onClick={() => start(post<{ job: JobDto }>("/imports/demo"))}
          >
            Load demo data instead
          </button>
        )}
      </form>
      <ErrorBox error={error} />
      <JobLine job={job} />
      {job?.status === "completed" && (
        <ImportReport files={(job.result as { files: FileReport[] }).files} />
      )}
      <ImportHistory jobs={history.data?.jobs ?? []} />
    </section>
  );
}

function ImportReport({ files }: { files: FileReport[] }) {
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

interface Credential {
  provider: "anthropic" | "openai";
  model: string;
  keyHint: string;
  active: boolean;
}

const PROVIDERS = { anthropic: "Anthropic (Claude)", openai: "OpenAI" };

function AiKeys() {
  const keys = useResource<{ credentials: Credential[] }>("/ai/credentials");
  const [provider, setProvider] = useState<keyof typeof PROVIDERS>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await put(`/ai/credentials/${provider}`, { apiKey, model: model || undefined });
      setApiKey("");
      keys.reload();
    } catch (err) {
      setError(err as Error);
    }
  };
  return (
    <section className="card stack">
      <h2>AI provider</h2>
      <p className="small secondary">
        Bring your own key. It is encrypted on this server, never shown again, and only used for
        reviews and questions you start. AI usage is billed to your provider account.
      </p>
      {keys.data?.credentials.map((c) => (
        <div key={c.provider} className="row">
          <strong>{PROVIDERS[c.provider]}</strong>{" "}
          <span className="muted">
            key ending {c.keyHint}, model {c.model}
          </span>
          {c.active && <span className="badge ai">In use</span>}
          <button
            className="btn small danger"
            onClick={() => void del(`/ai/credentials/${c.provider}`).then(keys.reload)}
          >
            Remove
          </button>
        </div>
      ))}
      <form className="form-grid" onSubmit={save}>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as keyof typeof PROVIDERS)}
          >
            {Object.entries(PROVIDERS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="API key">
          <input
            type="password"
            autoComplete="off"
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <Field label="Model (optional)">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "anthropic" ? "claude-opus-5-5" : "gpt-5"}
          />
        </Field>
        <div style={{ alignSelf: "end" }}>
          <button className="btn primary">Save key</button>
        </div>
      </form>
      <ErrorBox error={error} />
    </section>
  );
}

function DataControls() {
  const { refreshStatus, signOut } = useSession();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const run = (action: () => Promise<unknown>, done: string) => {
    setError(null);
    action()
      .then(() => setMessage(done))
      .catch(setError);
  };
  const download = async () => {
    const data = await api<{ exportedAt: string }>("/me/export");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `polaris-export-${data.exportedAt.slice(0, 10)}.json`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card stack">
      <h2>Your data</h2>
      <div>
        <button className="btn" onClick={() => run(download, "Export downloaded.")}>
          Download all my data (JSON)
        </button>
      </div>
      <p className="small secondary">
        Deleting needs your password. Deleting imported data keeps your goals, experiments and
        plans. Deleting the account removes everything.
      </p>
      <div className="row">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password to confirm"
        />
        <button
          className="btn danger"
          disabled={!password}
          onClick={() =>
            run(() => del("/me/data", { password }).then(refreshStatus), "Imported data deleted.")
          }
        >
          Delete imported data
        </button>
        <button
          className="btn danger"
          disabled={!password}
          onClick={() => run(() => del("/me", { password }).then(signOut), "Account deleted.")}
        >
          Delete my account
        </button>
      </div>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      <ErrorBox error={error} />
    </section>
  );
}
