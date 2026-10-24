import { useState } from "react";
import type { ProposalDto } from "../../shared/action-types";
import { JobFormCard, usePost } from "../components/action";
import { EvidenceList } from "../components/content";
import { ResourceView } from "../components/resource";
import { Empty, ErrorBox, Field, PageHead } from "../components/ui";
import { formatDate } from "../lib/format";
import { useResource, useStartJob } from "../lib/hooks";

const KIND: Record<ProposalDto["kind"], string> = {
  plan_item: "Plan item",
  experiment: "Experiment",
  goal: "Goal",
};

const STATUS: Record<ProposalDto["status"], string> = {
  pending: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Approved and added",
  failed: "Approved, but could not be added",
};

export function ApprovalsPage() {
  const list = useResource<{ proposals: ProposalDto[] }>("/action/proposals");
  return (
    <div className="stack">
      <PageHead
        title="Approvals"
        intro="Changes the AI suggests wait here. Nothing is added to your plan until you approve it."
      />
      <PlanRequest onDone={list.reload} />
      <ResourceView resource={list}>
        {({ proposals }) => <ProposalLists proposals={proposals} onChange={list.reload} />}
      </ResourceView>
    </div>
  );
}

function PlanRequest({ onDone }: { onDone: () => void }) {
  const [weeks, setWeeks] = useState("4");
  const job = useStartJob(onDone);
  return (
    <JobFormCard
      title="Ask for a content plan"
      intro="The AI reads your analytics and current plan and proposes posts, and perhaps one experiment, each with the evidence it rests on. Needs an AI key and imported data."
      job={job}
      submitLabel="Propose a plan"
      onSubmit={() => job.start("/action/proposals/plan", { weeks: Number(weeks) })}
    >
      <Field label="Weeks ahead">
        <select value={weeks} onChange={(e) => setWeeks(e.target.value)}>
          {[1, 2, 4, 6, 8].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Field>
    </JobFormCard>
  );
}

function ProposalLists({
  proposals,
  onChange,
}: {
  proposals: ProposalDto[];
  onChange: () => void;
}) {
  const pending = proposals.filter((p) => p.status === "pending" || p.status === "failed");
  const decided = proposals.filter((p) => !pending.includes(p));
  return (
    <>
      {pending.length === 0 ? (
        <Empty title="Nothing waiting for approval">
          <p>Ask for a content plan above; its suggestions will appear here for you to review.</p>
        </Empty>
      ) : (
        <div className="stack">
          {pending.map((p) => (
            <ProposalCard key={p.id} proposal={p} onChange={onChange} />
          ))}
        </div>
      )}
      {decided.length > 0 && <History proposals={decided} />}
    </>
  );
}

function ProposalCard({ proposal: p, onChange }: { proposal: ProposalDto; onChange: () => void }) {
  const approve = usePost(`/action/proposals/${p.id}/approve`, onChange);
  const reject = usePost(`/action/proposals/${p.id}/reject`, onChange);
  const busy = approve.busy || reject.busy;
  return (
    <article className="card stack" aria-label={`${KIND[p.kind]}: ${summary(p)}`}>
      <header className="row">
        <span className="badge ai">AI</span>
        <span className="badge">{KIND[p.kind]}</span>
        {p.basedOnDemoData && <span className="badge">Demo data</span>}
        <strong>{summary(p)}</strong>
      </header>
      <PayloadFields proposal={p} />
      <p>
        <span className="muted">Why: </span>
        {p.rationale}
      </p>
      <EvidenceList evidence={p.evidence} empty="No evidence cited." />
      {p.error && <div className="banner error">{p.error}</div>}
      <ErrorBox error={approve.error ?? reject.error} />
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => approve.run()}>
          {p.status === "failed" ? "Try again" : "Approve"}
        </button>
        <button className="btn" disabled={busy} onClick={() => reject.run()}>
          Reject
        </button>
      </div>
    </article>
  );
}

function summary(p: ProposalDto): string {
  const { title, name } = p.payload as { title?: string; name?: string };
  return title ?? name ?? KIND[p.kind];
}

const LABELS: Record<string, string> = {
  concept: "Concept",
  targetTopic: "Topic",
  plannedDate: "Planned for",
  hypothesis: "Hypothesis",
  variable: "What changes",
  metric: "Measured by",
  startDate: "Starts",
  endDate: "Ends",
  target: "Target",
};

function PayloadFields({ proposal }: { proposal: ProposalDto }) {
  const entries = Object.entries(proposal.payload).filter(([k, v]) => k in LABELS && v !== "");
  return (
    <dl className="small">
      {entries.map(([key, value]) => (
        <div key={key} className="row">
          <dt className="muted">{LABELS[key]}</dt>
          <dd>{key.endsWith("Date") ? formatDate(String(value)) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function History({ proposals }: { proposals: ProposalDto[] }) {
  return (
    <section className="card stack" aria-label="History">
      <h2>History</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Kind</th>
              <th>Outcome</th>
              <th>Decided</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>{summary(p)}</td>
                <td>{KIND[p.kind]}</td>
                <td>{STATUS[p.status]}</td>
                <td>{p.decidedAt ? formatDate(p.decidedAt) : "not available"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
