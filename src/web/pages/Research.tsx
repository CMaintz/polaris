import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import type { PeerDto, ResearchReportDto } from "../../shared/intelligence-types";
import { del, post } from "../lib/api";
import { type Resource, useResource, useStartJob } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { ExternalLink, ReportCard } from "../components/intelligence";
import { ResourceView } from "../components/resource";
import { Empty, ErrorBox, Field, JobLine, PageHead } from "../components/ui";

export function ResearchPage() {
  const reports = useResource<{ items: ResearchReportDto[] }>("/intelligence/research");
  const peers = useResource<{ items: PeerDto[] }>("/intelligence/peers");
  const keys = useResource<{ credentials: unknown[] }>("/ai/credentials");
  const hasKey = (keys.data?.credentials.length ?? 0) > 0;
  return (
    <div className="stack">
      <PageHead
        title="Research"
        intro="Ask a question about your field or a peer. Your own AI provider searches the web and relates what it finds to your topics and best posts."
      />
      {keys.data && !hasKey && (
        <div className="banner error">
          <span>
            Research needs an AI key.{" "}
            <Link to="/settings">Add an OpenAI or Anthropic key in Settings</Link>.
          </span>
        </div>
      )}
      <p className="small secondary">
        A research run sends your question, the peer notes you wrote, your topics and the text of
        your top posts to your provider. Web search is billed by your provider.
      </p>
      <AskForm peers={peers.data?.items ?? []} disabled={!hasKey} onDone={reports.reload} />
      <section className="stack">
        <h2>Past reports</h2>
        <ResourceView resource={reports}>
          {(data) =>
            data.items.length === 0 ? (
              <Empty title="No research yet">
                <p>Ask a question above. Reports appear here with their sources.</p>
              </Empty>
            ) : (
              data.items.map((r) => <ReportCard key={r.id} report={r} />)
            )
          }
        </ResourceView>
      </section>
      <Peers peers={peers} />
    </div>
  );
}

function AskForm({
  peers,
  disabled,
  onDone,
}: {
  peers: PeerDto[];
  disabled: boolean;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [peerId, setPeerId] = useState("");
  const job = useStartJob(onDone);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    job.start("/intelligence/research", { question, peerId: peerId || null });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Ask</h2>
      <Field label="Question">
        <textarea
          required
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What are people in my field saying about AI in hiring this month?"
        />
      </Field>
      <Field label="About a peer (optional)">
        <select value={peerId} onChange={(e) => setPeerId(e.target.value)}>
          <option value="">No one in particular</option>
          {peers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <ErrorBox error={job.error} />
      <JobLine job={job.job} />
      <div>
        <button className="btn primary" disabled={disabled || job.running}>
          Research
        </button>
      </div>
    </form>
  );
}

function Peers({ peers }: { peers: Resource<{ items: PeerDto[] }> }) {
  const [form, setForm] = useState({ name: "", profileUrl: "", notes: "" });
  const add = useMutation(
    () => post("/intelligence/peers", { ...form, profileUrl: form.profileUrl || null }),
    () => {
      setForm({ name: "", profileUrl: "", notes: "" });
      peers.reload();
    },
  );
  const remove = useMutation((id: string) => del(`/intelligence/peers/${id}`), peers.reload);
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [name]: e.target.value }),
  });
  return (
    <section className="card stack">
      <h2>Peers to watch</h2>
      <p className="small secondary">
        A note to yourself about people you follow. Polaris never visits or reads their profiles;
        research uses only public web search and what you write here.
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <Field label="Name">
          <input required maxLength={200} {...field("name")} />
        </Field>
        <Field label="Profile URL">
          <input type="url" maxLength={2000} {...field("profileUrl")} placeholder="https://" />
        </Field>
        <Field label="Notes">
          <input maxLength={5000} {...field("notes")} />
        </Field>
        <div>
          <button className="btn" disabled={add.busy}>
            Add peer
          </button>
        </div>
      </form>
      <ErrorBox error={add.error ?? remove.error} />
      <ResourceView resource={peers}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="muted">
              No peers yet. Add someone above to pick them when you ask a question.
            </p>
          ) : (
            <ul>
              {data.items.map((p) => (
                <li key={p.id} className="row">
                  <ExternalLink url={p.profileUrl}>{p.name}</ExternalLink>
                  {p.notes && <span className="small muted">{p.notes}</span>}
                  <button
                    className="btn small danger"
                    disabled={remove.busy}
                    onClick={() => remove.run(p.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </ResourceView>
    </section>
  );
}
