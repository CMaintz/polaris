/** A 0 to 1 progress bar; null draws empty. */
export function Meter({ value, behind }: { value: number | null; behind?: boolean }) {
  const width = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`meter${behind ? " behind" : ""}`}
      role="meter"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${width}%` }} />
    </div>
  );
}
