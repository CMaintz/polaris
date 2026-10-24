import { type FormEvent, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DraftDetailDto, DraftDto } from "../../shared/action-types";
import { AiDraftForm } from "../components/action/ai-draft-form";
import { TextEditor } from "../components/action/draft-editor";
import { PublicationCard } from "../components/action/publication-card";
import { ScheduleForm } from "../components/action/schedule-form";
import { Versions } from "../components/action/versions";
import { ErrorBox } from "../components/common/feedback";
import { Empty, PageHead } from "../components/common/layout";
import { ResourceView } from "../components/common/resource-view";
import { useMutation } from "../lib/hooks/mutation";
import { useResource } from "../lib/hooks/resource";
import { post } from "../lib/api";

export function StudioPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("draft");
  const list = useResource<{ drafts: DraftDto[] }>("/action/drafts");
  const select = useCallback((id: string) => setParams({ draft: id }), [setParams]);
  const created = useCallback(
    (id: string) => {
      list.reload();
      select(id);
    },
    [list, select],
  );
  return (
    <div className="stack">
      <PageHead
        title="Studio"
        intro="Write and refine posts, approve them, and schedule them. Nothing is posted until you approve and schedule it."
      />
      <div className="grid two">
        <div className="stack">
          <AiDraftForm draftId={selected} onDone={list.reload} onCreated={select} />
          <NewDraftForm onCreated={created} />
          <ResourceView resource={list}>
            {({ drafts }) => <DraftList drafts={drafts} selected={selected} onSelect={select} />}
          </ResourceView>
        </div>
        {selected ? (
          <DraftEditor key={selected} id={selected} onChange={list.reload} />
        ) : (
          <Empty title="No draft open">
            <p>Pick a draft from the list, start one, or let the AI write a first version.</p>
          </Empty>
        )}
      </div>
    </div>
  );
}

function DraftList(props: {
  drafts: DraftDto[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (props.drafts.length === 0) {
    return (
      <Empty title="No drafts yet">Start a draft above, or write one from a brief with AI.</Empty>
    );
  }
  return (
    <section className="card stack" aria-label="Drafts">
      <h2>Drafts</h2>
      {props.drafts.map((d) => (
        <button
          key={d.id}
          className={`btn${d.id === props.selected ? " primary" : ""}`}
          style={{ textAlign: "left" }}
          onClick={() => props.onSelect(d.id)}
        >
          {d.title} <span className="small">v{d.version}</span>{" "}
          {d.approved && <span className="badge">Approved</span>}
        </button>
      ))}
    </section>
  );
}

function NewDraftForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const create = useMutation(
    useCallback(async () => {
      const { draft } = await post<{ draft: DraftDto }>("/action/drafts", { title, text: "" });
      setTitle("");
      onCreated(draft.id);
    }, [title, onCreated]),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.run();
  };
  return (
    <form className="card row" onSubmit={submit} aria-label="New draft">
      <input
        required
        maxLength={200}
        placeholder="New draft title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button className="btn" disabled={create.busy}>
        Start draft
      </button>
      <ErrorBox error={create.error} />
    </form>
  );
}

function DraftEditor({ id, onChange }: { id: string; onChange: () => void }) {
  const detail = useResource<DraftDetailDto>(`/action/drafts/${id}`);
  const reload = useCallback(() => {
    detail.reload();
    onChange();
  }, [detail, onChange]);
  return (
    <ResourceView resource={detail}>
      {(d) => (
        <div className="stack">
          <TextEditor key={d.draft.version} detail={d} onSaved={reload} />
          <ScheduleForm draft={d.draft} onScheduled={reload} />
          {d.publications.length > 0 && (
            <section className="card stack" aria-label="Scheduled and published">
              <h2>Scheduled and published</h2>
              {d.publications.map((p) => (
                <PublicationCard key={p.id} publication={p} onChange={reload} />
              ))}
            </section>
          )}
          <Versions detail={d} onRestored={reload} />
        </div>
      )}
    </ResourceView>
  );
}
