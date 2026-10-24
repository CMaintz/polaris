import { useState } from "react";
import type { AccountSummaryDto, PlatformDto } from "../../../shared/account-types";
import { del, patch, post } from "../../lib/api";
import { PLATFORM_NAMES } from "../../lib/accounts";
import { useForm } from "../../lib/hooks/form";
import { useMutation } from "../../lib/hooks/mutation";
import { ErrorBox } from "../common/feedback";
import { Field } from "../common/fields";
import { useSession } from "../../lib/session";

export function Accounts() {
  const { accounts } = useSession();
  return (
    <section className="card stack">
      <h2>Accounts</h2>
      <p className="small secondary">
        One account per profile you publish on. Everything in Polaris shows the active account;
        switch in the sidebar.
      </p>
      {accounts?.map((a) => (
        <AccountRow key={a.id} account={a} />
      ))}
      <AddAccount />
    </section>
  );
}

function AddAccount() {
  const { accountsChanged } = useSession();
  const form = useForm({ platform: "other", label: "" }, async (v) => {
    await post("/accounts", v as { platform: PlatformDto; label: string });
    accountsChanged();
  });
  return (
    <form className="row" onSubmit={form.submit}>
      <Field label="Platform">
        <select {...form.field("platform")}>
          {Object.entries(PLATFORM_NAMES).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input required maxLength={60} placeholder="My blog" {...form.field("label")} />
      </Field>
      <button className="btn" disabled={form.busy}>
        Add account
      </button>
      <ErrorBox error={form.error} />
    </form>
  );
}

function AccountRow({ account }: { account: AccountSummaryDto }) {
  const { accountsChanged } = useSession();
  const [label, setLabel] = useState(account.label);
  const [password, setPassword] = useState("");
  const rename = useMutation(() => patch(`/accounts/${account.id}`, { label }), accountsChanged);
  const remove = useMutation(() => del(`/accounts/${account.id}`, { password }), accountsChanged);
  return (
    <div className="row" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
      <input
        value={label}
        maxLength={60}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Account name"
      />
      <span className="small muted">
        {PLATFORM_NAMES[account.platform]}
        {account.active && " · active"}
      </span>
      <button
        className="btn small"
        disabled={rename.busy || label === account.label}
        onClick={() => rename.run()}
      >
        Rename
      </button>
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Password to delete"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label={`Password to delete ${account.label}`}
      />
      <button
        className="btn small danger"
        disabled={!password || remove.busy}
        onClick={() => remove.run()}
      >
        Delete account and its data
      </button>
      <ErrorBox error={rename.error ?? remove.error} />
    </div>
  );
}
