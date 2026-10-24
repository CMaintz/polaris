import { post } from "../../lib/api";
import { PLATFORM_NAMES } from "../../lib/accounts";
import { useMutation } from "../../lib/hooks/mutation";
import { useSession } from "../../lib/session";
import { ErrorBox } from "../common/feedback";

/** Every page shows the active account's data, so switching here reloads them all. */
export function AccountSwitcher() {
  const { accounts, accountsChanged } = useSession();
  const activate = useMutation((id: string) => post(`/accounts/${id}/activate`), accountsChanged);
  if (!accounts || accounts.length === 0) return null;
  const active = accounts.find((a) => a.active);
  return (
    <div className="nav-group">
      <label className="nav-group-title" htmlFor="account-switcher">
        Account
      </label>
      <select
        id="account-switcher"
        value={active?.id ?? ""}
        disabled={activate.busy}
        onChange={(e) => activate.run(e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label} ({PLATFORM_NAMES[a.platform]})
          </option>
        ))}
      </select>
      <ErrorBox error={activate.error} />
    </div>
  );
}
