import type { LengthDto } from "../../../shared/action-types";

export function LengthLine({ length }: { length: LengthDto }) {
  return (
    <span className={`small${length.over ? "" : " muted"}`} role="status">
      {length.length} of {length.limit} characters
      {length.over && " - too long for LinkedIn, shorten it before approving"}
    </span>
  );
}
