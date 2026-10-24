import type { ProposalDto } from "../../../shared/action-types";
import { formatDate } from "../../lib/format";
import { Empty } from "../common/layout";
import { ProposalCard } from "./proposal-card";
import { PROPOSAL_KIND, PROPOSAL_STATUS, proposalSummary } from "./proposal-labels";

/** Pending and failed proposals wait for a decision; the rest are history. */
export function ProposalLists({
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
                <td>{proposalSummary(p)}</td>
                <td>{PROPOSAL_KIND[p.kind]}</td>
                <td>{PROPOSAL_STATUS[p.status]}</td>
                <td>{p.decidedAt ? formatDate(p.decidedAt) : "not available"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
