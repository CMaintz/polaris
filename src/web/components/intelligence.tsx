import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import type {
  Cadence,
  PeerDto,
  ResearchReportDto,
  ResearchSourceDto,
  ScheduleDto,
  ScheduleKind,
} from "../../shared/intelligence-types";
import { del, patch, post, tzOffset } from "../lib/api";
import { formatDate } from "../lib/format";
import { useResource } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { ResourceView } from "./resource";
import { ErrorBox, Field, LabelOptions } from "./ui";
import { safeHref } from "../lib/links";

// Report text comes from a model that read web pages, so everything here renders as React
// text nodes, never as HTML, and only http(s) URLs become links.

export function ExternalLink({ url, children }: { url: string | null; children: string }) {
  const href = safeHref(url);
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

function Sources({ sources }: { sources: ResearchSourceDto[] }) {
  return (
    <span className="small muted">
      {sources.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}[{s.id}] <ExternalLink url={s.url}>{s.title}</ExternalLink>
        </span>
      ))}
    </span>
  );
}

const STATUS: Record<ResearchReportDto["status"], string> = {
  running: "Researching...",
  completed: "Done",
  failed: "Failed",
};

export function ReportCard({ report }: { report: ResearchReportDto }) {
  const body = report.report;
  return (
    <article className="card stack">
      <header>
        <h3>{report.question}</h3>
        <div className="row">
          <span className="badge ai">AI research</span>
          {report.peerName && <span className="badge">About {report.peerName}</span>}
          {body?.basedOnDemoData && <span className="badge">Demo data</span>}
          <span className="small muted">
            {formatDate(report.createdAt)} - {STATUS[report.status]}
          </span>
        </div>
      </header>
      {report.error && <p className="small muted">{report.error}</p>}
      {body && <ReportBody body={body} />}
    </article>
  );
}

function ReportBody({ body }: { body: NonNullable<ResearchReportDto["report"]> }) {
  return (
    <>
      <p style={{ margin: 0 }}>{body.summary}</p>
      <h4>Findings</h4>
      {body.findings.length === 0 ? (
        <p className="muted small">No finding was backed by a source.</p>
      ) : (
        <ul>
          {body.findings.map((f, i) => (
            <li key={i}>
              {f.finding} <Sources sources={f.sources} />
            </li>
          ))}
        </ul>
      )}
      <h4>How it relates to your content</h4>
      <p style={{ margin: 0 }}>{body.relation.text}</p>
      <div className="row">
        {body.relation.topics.map((t) => (
          <span key={t} className="badge">
            #{t}
          </span>
        ))}
        {body.relation.posts.map((p) => (
          <Link key={p.id} className="small" to={`/content/${p.id}`}>
            {p.label}
          </Link>
        ))}
      </div>
      {body.caveats.length > 0 && (
        <>
          <h4>Caveats</h4>
          <ul className="small muted">
            {body.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const KINDS: Record<ScheduleKind, string> = {
  feed_refresh: "Refresh feeds",
  trend_digest: "Trend digest",
  account_review: "AI account review",
  research_rerun: "Re-run a research question",
};

export function SchedulesSection() {
  const schedules = useResource<{ items: ScheduleDto[] }>("/intelligence/schedules");
  const peers = useResource<{ items: PeerDto[] }>("/intelligence/peers");
  return (
    <section className="card stack">
      <h2>Schedules</h2>
      <p className="small secondary">
        Scheduled AI work uses your own API key and is billed by your provider each time it runs.
      </p>
      <NewSchedule peers={peers.data?.items ?? []} onDone={schedules.reload} />
      <ResourceView resource={schedules}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="muted">
              Nothing is scheduled. Add a schedule above to run it automatically.
            </p>
          ) : (
            <ScheduleTable items={data.items} onChange={schedules.reload} />
          )
        }
      </ResourceView>
    </section>
  );
}

function NewSchedule({ peers, onDone }: { peers: PeerDto[]; onDone: () => void }) {
  const [kind, setKind] = useState<ScheduleKind>("feed_refresh");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [question, setQuestion] = useState("");
  const [peerId, setPeerId] = useState("");
  const [withAi, setWithAi] = useState(true);
  const save = useMutation(
    () =>
      post("/intelligence/schedules", {
        kind,
        cadence,
        params: { tz: tzOffset(), withAi, question, peerId: peerId || null },
      }),
    onDone,
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <Field label="What">
          <select value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
            <LabelOptions labels={KINDS} />
          </select>
        </Field>
        <Field label="How often">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        {kind === "trend_digest" && (
          <Field label="AI summary">
            <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} />
          </Field>
        )}
        {kind === "research_rerun" && (
          <Field label="About">
            <select value={peerId} onChange={(e) => setPeerId(e.target.value)}>
              <option value="">No one in particular</option>
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {kind === "research_rerun" && (
        <Field label="Question">
          <textarea
            required
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
      )}
      <ErrorBox error={save.error} />
      <div>
        <button className="btn primary" disabled={save.busy}>
          Add schedule
        </button>
      </div>
    </form>
  );
}

function ScheduleTable({ items, onChange }: { items: ScheduleDto[]; onChange: () => void }) {
  const toggle = useMutation(
    (s: ScheduleDto) => patch(`/intelligence/schedules/${s.id}`, { enabled: !s.enabled }),
    onChange,
  );
  const remove = useMutation((s: ScheduleDto) => del(`/intelligence/schedules/${s.id}`), onChange);
  return (
    <div className="table-wrap">
      <ErrorBox error={toggle.error ?? remove.error} />
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>How often</th>
            <th>Last run</th>
            <th>Next run</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>
                {KINDS[s.kind]}
                {s.params.question && <div className="small muted">{s.params.question}</div>}
              </td>
              <td>{s.cadence === "daily" ? "Daily" : "Weekly"}</td>
              <td>{s.lastRunAt ? formatDate(s.lastRunAt) : "Never"}</td>
              <td>{s.enabled ? formatDate(s.nextRunAt) : "Paused"}</td>
              <td className="row">
                <button className="btn small" disabled={toggle.busy} onClick={() => toggle.run(s)}>
                  {s.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn small danger"
                  disabled={remove.busy}
                  onClick={() => remove.run(s)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
