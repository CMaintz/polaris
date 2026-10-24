import { del } from "../../lib/api";
import { useMutation } from "../../lib/hooks/mutation";
import { useSession } from "../../lib/session";
import { ErrorBox } from "../common/feedback";

export function DemoBanner() {
  const { status, refreshStatus } = useSession();
  const remove = useMutation(() => del("/imports/demo"), refreshStatus);
  if (!status?.hasDemoData) return null;
  return (
    <div className="banner demo" role="note">
      <span>
        <strong>Demo data.</strong> Everything here is synthetic, not your LinkedIn account.
        Importing your own data replaces it.
      </span>
      <button className="btn small" disabled={remove.busy} onClick={() => remove.run()}>
        Remove demo data
      </button>
      <ErrorBox error={remove.error} />
    </div>
  );
}
