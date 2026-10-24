import { useState } from "react";
import { api, del } from "../../lib/api";
import { downloadJson } from "../../lib/download";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { useSession } from "../../lib/session";

export function DataControls() {
  const [message, setMessage] = useState<string | null>(null);
  const action = useMutation((run: () => Promise<unknown>, done: string) => {
    setMessage(null);
    return run().then(() => setMessage(done));
  });
  return (
    <section className="card stack">
      <h2>Your data</h2>
      <div>
        <button
          className="btn"
          disabled={action.busy}
          onClick={() => action.run(downloadExport, "Export downloaded.")}
        >
          Download all my data (JSON)
        </button>
      </div>
      <p className="small secondary">
        Deleting needs your password. Deleting imported data keeps your goals, experiments and
        plans. Deleting the account removes everything.
      </p>
      <DeleteControls busy={action.busy} run={action.run} />
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      <ErrorBox error={action.error} />
    </section>
  );
}

async function downloadExport() {
  const data = await api<{ exportedAt: string }>("/me/export");
  downloadJson(data, `polaris-export-${data.exportedAt.slice(0, 10)}.json`);
}

function DeleteControls({
  busy,
  run,
}: {
  busy: boolean;
  run: (action: () => Promise<unknown>, done: string) => void;
}) {
  const { refreshStatus, signOut } = useSession();
  const [password, setPassword] = useState("");
  return (
    <div className="row">
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Password to confirm"
      />
      <button
        className="btn danger"
        disabled={!password || busy}
        onClick={() =>
          run(() => del("/me/data", { password }).then(refreshStatus), "Imported data deleted.")
        }
      >
        Delete imported data
      </button>
      <button
        className="btn danger"
        disabled={!password || busy}
        onClick={() => run(() => del("/me", { password }).then(signOut), "Account deleted.")}
      >
        Delete my account
      </button>
    </div>
  );
}
