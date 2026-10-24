import type { PeerDto } from "../../../shared/intelligence-types";
import { Field } from "../common/fields";

/** A peer picker whose empty value means no particular peer. */
export function PeerField(props: {
  label: string;
  peers: PeerDto[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Field label={props.label}>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">No one in particular</option>
        {props.peers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
