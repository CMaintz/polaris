import type { ReactNode } from "react";
import { contentTypeLabel, contentTypes } from "../../lib/format";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export interface FieldBinding {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
}

export function DateRangeFields({ start, end }: { start: FieldBinding; end: FieldBinding }) {
  return (
    <>
      <Field label="Start">
        <input required type="date" {...start} />
      </Field>
      <Field label="End">
        <input required type="date" {...end} />
      </Field>
    </>
  );
}

export function ContentTypeField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Type">
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">All types</option>
        {contentTypes().map((t) => (
          <option key={t} value={t}>
            {contentTypeLabel(t)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function LabelOptions({ labels }: { labels: Record<string, string> }) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

/** The submit row of a form that both adds and edits; Cancel appears only while editing. */
export function EditFormActions(props: {
  editing: boolean;
  busy: boolean;
  saveLabel: string;
  addLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="row">
      <button className="btn primary" disabled={props.busy}>
        {props.editing ? props.saveLabel : props.addLabel}
      </button>
      {props.editing && (
        <button type="button" className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
