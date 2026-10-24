import { useState } from "react";
import type { FeedDto } from "../../../shared/intelligence-types";
import { del, post } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { Field } from "../common/fields";

export function Feeds({
  feeds,
  error,
  onChange,
}: {
  feeds: FeedDto[] | null;
  error: Error | null;
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const add = useMutation(
    () => post("/intelligence/feeds", { url }),
    () => {
      setUrl("");
      onChange();
    },
  );
  const remove = useMutation((id: string) => del(`/intelligence/feeds/${id}`), onChange);
  return (
    <section className="card stack">
      <h2>Feeds</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <Field label="RSS or Atom feed URL">
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
        <button className="btn primary" disabled={add.busy}>
          Follow
        </button>
      </form>
      <ErrorBox error={error ?? add.error ?? remove.error} />
      {feeds && feeds.length === 0 && (
        <p className="muted">No feeds yet. Paste the URL of a news or blog feed above.</p>
      )}
      {feeds && feeds.length > 0 && (
        <FeedTable feeds={feeds} busy={remove.busy} onRemove={(id) => remove.run(id)} />
      )}
    </section>
  );
}

function FeedTable(props: { feeds: FeedDto[]; busy: boolean; onRemove: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Feed</th>
            <th className="num">Items</th>
            <th>Last fetch</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.feeds.map((f) => (
            <tr key={f.id}>
              <td>
                {f.title ?? f.url}
                <div className="small muted">{f.url}</div>
              </td>
              <td className="num">{f.itemCount}</td>
              <td>
                {f.lastFetchedAt ? formatDate(f.lastFetchedAt) : "Not fetched yet"}
                {f.lastStatus === "error" && <div className="small">Failed: {f.lastError}</div>}
              </td>
              <td>
                <button
                  className="btn small danger"
                  disabled={props.busy}
                  onClick={() => props.onRemove(f.id)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
