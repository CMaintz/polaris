import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IndexStatusDto, SearchHitDto, SearchResponseDto } from "../../shared/knowledge-types";
import { contentTypeLabel, formatDate } from "../lib/format";
import { useResource } from "../lib/hooks";
import { IndexStatusCard, Snippet } from "../components/knowledge";
import { ResourceView } from "../components/resource";
import { ContentTypeField, Field, PageHead } from "../components/ui";

const FIELDS = ["q", "mode", "type", "topic", "theme", "from", "to"] as const;
type Draft = Record<(typeof FIELDS)[number], string>;

const draftFrom = (params: URLSearchParams) =>
  Object.fromEntries(FIELDS.map((f) => [f, params.get(f) ?? ""])) as Draft;

const paramsFrom = (draft: Draft) =>
  new URLSearchParams(Object.entries(draft).filter(([, v]) => v.trim()) as [string, string][]);

/**
 * The search lives in the URL so it can be bookmarked. Every field is a draft until Search
 * is pressed: a meaning search spends an embedding call on the user's key, so it must not
 * run per keystroke or per filter change.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() => draftFrom(params));
  const status = useResource<IndexStatusDto>("/knowledge/status");
  const q = params.get("q")?.trim() ?? "";
  const results = useResource<SearchResponseDto>(q ? `/knowledge/search?${params}` : null);
  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(paramsFrom(draft));
  };
  const semanticOff = status.data !== null && !status.data.semantic.available;

  return (
    <div className="stack">
      <PageHead
        title="Search"
        intro="Find your posts by the words they use, or by what they are about."
      />
      <form className="card stack" role="search" onSubmit={submit}>
        <div className="row">
          <input
            type="search"
            style={{ flex: 1 }}
            value={draft.q}
            maxLength={200}
            onChange={(e) => set("q", e.target.value)}
            placeholder="pricing, hiring, a phrase you remember"
            aria-label="Search your posts"
          />
          <button className="btn primary" disabled={!draft.q.trim()}>
            Search
          </button>
        </div>
        <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small secondary">Match by</legend>
          <label className="row small">
            <input
              type="radio"
              name="mode"
              checked={draft.mode !== "semantic"}
              onChange={() => set("mode", "")}
            />
            Keywords
          </label>
          <label className="row small">
            <input
              type="radio"
              name="mode"
              checked={draft.mode === "semantic"}
              disabled={semanticOff}
              onChange={() => set("mode", "semantic")}
            />
            Meaning
          </label>
          {semanticOff && <span className="small muted">{status.data?.semantic.reason}</span>}
        </fieldset>
        <Filters draft={draft} set={set} />
      </form>
      {q ? (
        <ResourceView resource={results}>{(data) => <Results data={data} />}</ResourceView>
      ) : (
        <p className="muted">Type a word or phrase and press Search.</p>
      )}
      <ResourceView resource={status}>
        {(data) => <IndexStatusCard status={data} onDone={status.reload} />}
      </ResourceView>
    </div>
  );
}

function Filters({ draft, set }: { draft: Draft; set: (key: keyof Draft, value: string) => void }) {
  return (
    <div className="form-grid">
      <ContentTypeField value={draft.type} onChange={(v) => set("type", v)} />
      <Field label="Hashtag">
        <input
          value={draft.topic}
          onChange={(e) => set("topic", e.target.value)}
          placeholder="without #"
        />
      </Field>
      <Field label="Theme">
        <input
          value={draft.theme}
          onChange={(e) => set("theme", e.target.value)}
          placeholder="from the Themes page"
        />
      </Field>
      <Field label="From">
        <input type="date" value={draft.from} onChange={(e) => set("from", e.target.value)} />
      </Field>
      <Field label="To">
        <input type="date" value={draft.to} onChange={(e) => set("to", e.target.value)} />
      </Field>
    </div>
  );
}

function Results({ data }: { data: SearchResponseDto }) {
  return (
    <section className="stack">
      {data.notice && (
        <div className="banner" role="status">
          {data.notice}
        </div>
      )}
      {data.results.length === 0 ? (
        <p className="muted">
          No posts match. Try fewer words{data.used === "lexical" ? ", or search by meaning" : ""},
          or clear the filters.
        </p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.results.map((hit) => (
            <Hit key={hit.postId} hit={hit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Hit({ hit }: { hit: SearchHitDto }) {
  return (
    <li className="card">
      <Link to={`/content/${hit.postId}`}>
        <Snippet segments={hit.snippet} />
      </Link>
      <div className="row small muted" style={{ marginTop: 6 }}>
        <span>{formatDate(hit.publishedAt, hit.timeKnown)}</span>
        <span>{contentTypeLabel(hit.contentType)}</span>
        {hit.matchedBy.includes("keywords") && <span className="badge">Keywords</span>}
        {hit.similarity !== null && (
          <span className="badge ai">Meaning {Math.round(hit.similarity * 100)}%</span>
        )}
        {hit.themes.map((t) => (
          <span key={t} className="badge">
            {t}
          </span>
        ))}
        {hit.topics.slice(0, 4).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
    </li>
  );
}
