import type { TrendMatchDto } from "../../../shared/intelligence-types";
import { formatDate } from "../../lib/format";
import { ExternalLink } from "./external-link";

/** Feed items that mention the user's topics; `notes` adds a line per item id. */
export function MatchList({
  matches,
  notes = new Map(),
}: {
  matches: TrendMatchDto[];
  notes?: Map<string, string>;
}) {
  if (matches.length === 0)
    return <p className="muted">No feed items mention your topics in this period.</p>;
  return (
    <ul>
      {matches.map((m) => (
        <li key={m.itemId}>
          <ExternalLink url={m.link}>{m.title || "Untitled item"}</ExternalLink>{" "}
          <span className="small muted">
            {m.feedTitle ?? "Feed"} - {formatDate(m.day)} - {m.topics.map((t) => `#${t}`).join(" ")}
          </span>
          {notes.get(m.itemId) && <div className="small">{notes.get(m.itemId)}</div>}
        </li>
      ))}
    </ul>
  );
}
