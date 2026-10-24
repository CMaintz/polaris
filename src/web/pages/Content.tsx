import { useSearchParams } from "react-router-dom";
import type { PostPageDto } from "../../shared/api-types";
import { PAGE_PARAM, withParam } from "../lib/filters";
import { contentTypeLabel } from "../lib/format";
import { useResource } from "../lib/hooks";
import { metricOptions } from "../lib/metrics";
import { PostTable } from "../components/content";
import { ResourceView } from "../components/resource";
import { Field, PageHead } from "../components/ui";

const PAGE_SIZE = 25;
const TYPES = ["text", "image", "video", "document", "article", "link", "unknown"];
const SORTS: [string, string][] = [
  ["published", "Publish date"],
  ...metricOptions(["engagements", "impressions", "engagement_rate", "comments"]),
];

/** Filters live in the URL, so a filtered view can be bookmarked and survives a reload. */
export function ContentPage() {
  const [params, setParams] = useSearchParams();
  const offset = Number(params.get(PAGE_PARAM) ?? 0);
  const query = new URLSearchParams(params);
  query.set("limit", String(PAGE_SIZE));
  const page = useResource<PostPageDto>(`/posts?${query}`);
  // A filter change replaces the history entry and only paging adds one, so Back leaves the
  // page instead of undoing one keystroke at a time.
  const set = (key: string, value: string) =>
    setParams(withParam(params, key, value), { replace: key !== PAGE_PARAM });
  const filter = (key: string) => params.get(key) ?? "";

  return (
    <div className="stack">
      <PageHead
        title="Content"
        intro="Every imported post. Click a post for its full history and an AI review."
      />
      <ContentFilters topics={page.data?.topics ?? []} filter={filter} set={set} />
      <ResourceView resource={page}>
        {(data) => (
          <Results page={data} offset={offset} onPage={(o) => set(PAGE_PARAM, String(o))} />
        )}
      </ResourceView>
    </div>
  );
}

function ContentFilters({
  topics,
  filter,
  set,
}: {
  topics: string[];
  filter: (key: string) => string;
  set: (key: string, value: string) => void;
}) {
  return (
    <div className="card form-grid" role="search">
      <Field label="Search text">
        <input
          type="search"
          value={filter("q")}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Words in the post"
        />
      </Field>
      <Field label="Type">
        <select value={filter("type")} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {contentTypeLabel(t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Topic">
        <select value={filter("topic")} onChange={(e) => set("topic", e.target.value)}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Performance">
        <select value={filter("band")} onChange={(e) => set("band", e.target.value)}>
          <option value="">All posts</option>
          <option value="top">Top 25%</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom 25%</option>
          <option value="unrated">No metrics</option>
        </select>
      </Field>
      <Field label="From">
        <input type="date" value={filter("from")} onChange={(e) => set("from", e.target.value)} />
      </Field>
      <Field label="To">
        <input type="date" value={filter("to")} onChange={(e) => set("to", e.target.value)} />
      </Field>
      <Field label="Sort by">
        <select value={filter("sort") || "published"} onChange={(e) => set("sort", e.target.value)}>
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Order">
        <select value={filter("dir") || "desc"} onChange={(e) => set("dir", e.target.value)}>
          <option value="desc">Highest or newest first</option>
          <option value="asc">Lowest or oldest first</option>
        </select>
      </Field>
    </div>
  );
}

function Results({
  page,
  offset,
  onPage,
}: {
  page: PostPageDto;
  offset: number;
  onPage: (offset: number) => void;
}) {
  const last = Math.min(offset + PAGE_SIZE, page.total);
  return (
    <div className="card">
      <header>
        <h2>{page.total} posts</h2>
        {page.total > PAGE_SIZE && (
          <div className="row small">
            {offset + 1} to {last}
            <button
              className="btn small"
              disabled={offset === 0}
              onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <button
              className="btn small"
              disabled={last >= page.total}
              onClick={() => onPage(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        )}
      </header>
      <PostTable posts={page.items} />
    </div>
  );
}
