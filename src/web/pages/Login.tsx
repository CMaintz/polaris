import { type FormEvent, useState } from "react";
import type { UserDto } from "../../shared/core-types";
import { post } from "../lib/api";
import { Field } from "../components/common/fields";

export function LoginPage({ onSignedIn }: { onSignedIn: (user: UserDto) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await post<{ user: UserDto }>(`/auth/${mode}`, { email, password });
      onSignedIn(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>Polaris</h1>
          <p className="secondary">Your LinkedIn data, measured honestly.</p>
        </div>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 10 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary" disabled={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "First time here? Create the account" : "I already have an account"}
        </button>
      </form>
    </div>
  );
}
