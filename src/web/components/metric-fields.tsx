import type { InputHTMLAttributes } from "react";
import { type MetricKey, metricInputLabel } from "../lib/metrics";
import { Field, type FieldBinding } from "./ui";

/**
 * A metric picker and a number typed in that metric's unit. The value label follows the
 * selected metric, so a rate is always marked as a percentage where it is typed.
 */
export function MetricValueFields({
  options,
  metric,
  metricLabel,
  valueLabel,
  hint,
  value,
}: {
  options: [MetricKey, string][];
  metric: FieldBinding;
  metricLabel: string;
  valueLabel: string;
  hint?: string;
  value: FieldBinding & InputHTMLAttributes<HTMLInputElement>;
}) {
  const unitLabel = metricInputLabel(metric.value as MetricKey, valueLabel);
  return (
    <>
      <Field label={metricLabel}>
        <select {...metric}>
          {options.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={hint ? `${unitLabel}, ${hint}` : unitLabel}>
        <input type="number" step="any" {...value} />
      </Field>
    </>
  );
}
