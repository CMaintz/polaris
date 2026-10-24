import { type FormEvent, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import type {
  CampaignPerformanceDto,
  MeasuredDto,
  PeriodPerformanceDto,
  PillarDto,
} from "../../shared/strategy-types";
import { del, patch, post } from "../lib/api";
import {
  NOT_AVAILABLE,
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "../lib/format";
import { useResource } from "../lib/hooks";
import { useMutation } from "../lib/mutation";
import { ResourceView } from "./resource";
import { DataTable, Empty, ErrorBox, Field } from "./ui";

export const coverage = (observed: number, total: number) =>
  observed < total ? `${observed} of ${total} days` : `all ${total} days`;

export const perThousand = (value: number | null) =>
  value === null ? NOT_AVAILABLE : `${value.toFixed(2)} per 1,000 impressions`;

interface PillarDraft {
  name: string;
  description: string;
  topics: string;
  targetPercent: string;
}

const EMPTY_DRAFT: PillarDraft = { name: "", description: "", topics: "", targetPercent: "" };

const toDraft = (p: PillarDto): PillarDraft => ({
  name: p.name,
  description: p.description,
  topics: p.topics.map((t) => `#${t}`).join(" "),
  targetPercent: String(Math.round(p.targetShare * 1000) / 10),
});

const fromDraft = (d: PillarDraft) => ({
  name: d.name,
  description: d.description,
  topics: d.topics.split(/[\s,]+/).filter(Boolean),
  targetShare: Number(d.targetPercent) / 100,
});

interface PillarFormProps {
  editing: PillarDto | null;
  onSaved: () => void;
  onCancel: () => void;
}

function PillarForm({ editing, onSaved, onCancel }: PillarFormProps) {
  const [draft, setDraft] = useState(editing ? toDraft(editing) : EMPTY_DRAFT);
  const save = useCallback(
    (d: PillarDraft) =>
      editing
        ? patch(`/strategy/pillars/${editing.id}`, fromDraft(d))
        : post("/strategy/pillars", fromDraft(d)),
    [editing],
  );
  const done = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    onSaved();
  }, [onSaved]);
  const mutation = useMutation(save, done);
  const bind = (key: keyof PillarDraft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.run(draft);
  };
  return (
    <form className="stack" onSubmit={submit}>
      <h3>{editing ? `Edit ${editing.name}` : "New pillar"}</h3>
      <div className="form-grid">
        <Field label="Name">
          <input required maxLength={200} {...bind("name")} placeholder="Leadership lessons" />
        </Field>
        <Field label="Hashtag topics">
          <input required {...bind("topics")} placeholder="#leadership #management" />
        </Field>
        <Field label="Target share of posts (%)">
          <input required type="number" min="0" max="100" step="any" {...bind("targetPercent")} />
        </Field>
      </div>
      <Field label="Description">
        <textarea maxLength={2000} {...bind("description")} />
      </Field>
      <ErrorBox error={mutation.error} />
      <div className="row">
        <button className="btn primary" disabled={mutation.busy}>
          {editing ? "Save pillar" : "Add pillar"}
        </button>
        {editing && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const removePillar = (id: string) => del(`/strategy/pillars/${id}`);

export function PillarsSection({ onChange }: { onChange?: () => void }) {
  const list = useResource<{ items: PillarDto[] }>("/strategy/pillars");
  const [editing, setEditing] = useState<PillarDto | null>(null);
  const { reload } = list;
  const refresh = useCallback(() => {
    setEditing(null);
    reload();
    onChange?.();
  }, [reload, onChange]);
  const remove = useMutation(removePillar, refresh);
  return (
    <section className="card stack" aria-label="Content pillars">
      <h2>Content pillars</h2>
      <p className="small secondary">
        Recurring themes you plan to post about, each a set of hashtags with a target share of your
        posts.
      </p>
      <ResourceView resource={list}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="No pillars yet">
              <p>Add the themes you want to be known for, with the hashtags you use for them.</p>
            </Empty>
          ) : (
            <DataTable
              headers={["Pillar", "Topics", "Target", ""]}
              rows={items.map((p) => [
                p.name,
                p.topics.map((t) => `#${t}`).join(" "),
                formatPercent(p.targetShare, 0),
                <span className="row" key={p.id}>
                  <button className="btn small" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button
                    className="btn small danger"
                    disabled={remove.busy}
                    onClick={() => remove.run(p.id)}
                  >
                    Delete
                  </button>
                </span>,
              ])}
            />
          )
        }
      </ResourceView>
      <ErrorBox error={remove.error} />
      <PillarForm
        key={editing?.id ?? "new"}
        editing={editing}
        onSaved={refresh}
        onCancel={() => setEditing(null)}
      />
    </section>
  );
}

type Row = [string, (p: PeriodPerformanceDto) => string];

const PERFORMANCE_ROWS: Row[] = [
  ["Posts published", (p) => measured(p.postsPublished, formatNumber)],
  ["Median impressions", (p) => formatNumber(p.posts.medianImpressions)],
  ["Median engagement rate", (p) => formatPercent(p.posts.medianEngagementRate, 2)],
  ["Posts with metrics", (p) => `${p.posts.withMetrics} of ${p.posts.posts}`],
  ["Follower change", (p) => measured(p.followerChange, signed)],
];

function signed(value: number | null): string {
  return value !== null && value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function measured(m: MeasuredDto, format: (v: number | null) => string): string {
  if (m.value === null) return NOT_AVAILABLE;
  const days =
    m.observedDays < m.totalDays ? ` (data for ${coverage(m.observedDays, m.totalDays)})` : "";
  return `${format(m.value)}${days}`;
}

/** The campaign's linked posts against the account's posts from the same number of days before. */
export function CampaignPerformance({ campaignId }: { campaignId: string }) {
  const perf = useResource<CampaignPerformanceDto>(`/strategy/campaigns/${campaignId}/performance`);
  return (
    <ResourceView resource={perf}>
      {({ campaign, baseline, posts }) =>
        !campaign || !baseline ? (
          <p className="muted">
            This campaign has not started yet, so there is nothing to compare.
          </p>
        ) : (
          <div className="stack">
            {posts.length === 0 && (
              <p className="banner">
                No posts are linked yet. Link the campaign's posts to measure them.
              </p>
            )}
            <DataTable
              headers={[
                "",
                `Campaign (${formatPeriod(campaign.window)})`,
                `Before (${formatPeriod(baseline.window)})`,
              ]}
              rows={PERFORMANCE_ROWS.map(([label, value]) => [
                label,
                value(campaign),
                value(baseline),
              ])}
            />
            <p className="small muted">
              Campaign posts are the posts you linked, directly or through a published plan item.
              The baseline is every other post published in the days before. Follower change needs a
              follower count on the day before and the last day of each window.
            </p>
            <ul className="small">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link to={`/posts/${p.id}`}>{formatDate(p.publishedAt, p.timeKnown)}</Link>:{" "}
                  {p.excerpt ?? "(no text)"}
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </ResourceView>
  );
}
