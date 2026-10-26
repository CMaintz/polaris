import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { JobDto, KpiDto } from "../../shared/api-types";
import { changeDirection, formatChange, formatPeriod, formatValue } from "../lib/format";

export function PageHead({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Loading() {
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

/** The empty state docs/08 asks for: say what is needed next, and link to it. */
export function NeedsData() {
  return (
    <Empty title="No data yet">
      <p>Import your LinkedIn exports, or load the demo data to look around first.</p>
      <Link className="btn primary" to="/settings">
        Go to imports
      </Link>
    </Empty>
  );
}

export function KpiTile({ kpi }: { kpi: KpiDto }) {
  const change = formatChange(kpi.change.percent);
  const { observedDays, totalDays } = kpi.coverage;
  return (
    <div className="card" title={`Source: ${kpi.source}`}>
      <div className="kpi-label">{kpi.label}</div>
      <div className={`kpi-value${kpi.value === null ? " unknown" : ""}`}>
        {formatValue(kpi.value, kpi.unit)}
      </div>
      {change && (
        <div className={`delta ${changeDirection(kpi.change.percent)}`}>
          {change} <span className="muted small">vs previous {totalDays} days</span>
        </div>
      )}
      <div className="muted small">
        {formatPeriod(kpi.period)}
        {kpi.value !== null &&
          observedDays < totalDays &&
          ` (data for ${observedDays} of ${totalDays} days)`}
      </div>
    </div>
  );
}

export function Meter({ value, behind }: { value: number | null; behind?: boolean }) {
  const width = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`meter${behind ? " behind" : ""}`}
      role="meter"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${width}%` }} />
    </div>
  );
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
