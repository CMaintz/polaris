import { Link } from "react-router-dom";
import type { ResearchReportDto, ResearchSourceDto } from "../../../shared/intelligence-types";
import { formatDate } from "../../lib/format";
import { ExternalLink } from "./external-link";

// Report text comes from a model that read web pages, so everything here renders as React
// text nodes, never as HTML, and only http(s) URLs become links.

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
