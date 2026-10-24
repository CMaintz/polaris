import type { DraftDetailDto } from "../../../shared/action-types";
import { formatDate } from "../../lib/format";
import { usePost } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";

const ORIGIN: Record<string, string> = { user: "You", ai: "AI", restore: "Restored" };

export function Versions({
  detail,
  onRestored,
}: {
  detail: DraftDetailDto;
  onRestored: () => void;
}) {
  const restore = usePost(`/action/drafts/${detail.draft.id}/restore`, onRestored);
  return (
    <section className="card stack" aria-label="Versions">
      <h2>Versions</h2>
      <ErrorBox error={restore.error} />
      {detail.versions.map((v) => (
        <details key={v.version}>
          <summary>
            v{v.version} - {ORIGIN[v.origin]}, {formatDate(v.createdAt)}
            {v.basedOnDemo && <span className="badge"> Demo data</span>}
          </summary>
          <div className="post-text small">{v.text}</div>
          {v.notes && (
            <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>
              {v.notes}
            </p>
          )}
          {v.version !== detail.draft.version && (
            <button
              className="btn small"
              disabled={restore.busy}
              onClick={() => restore.run({ version: v.version })}
            >
              Restore as new version
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
