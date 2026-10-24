import { type FormEvent, useState } from "react";
import type { CredentialDto } from "../../../shared/ai-types";
import { del, put } from "../../lib/api";
import { useMutation } from "../../lib/hooks/mutation";
import { useResource } from "../../lib/hooks/resource";
import { ErrorBox } from "../common/feedback";
import { Field, LabelOptions } from "../common/fields";
import { ResourceView } from "../common/resource-view";

const PROVIDERS = { anthropic: "Anthropic (Claude)", openai: "OpenAI" };

export function AiKeys() {
  const keys = useResource<{ credentials: CredentialDto[] }>("/ai/credentials");
  const [provider, setProvider] = useState<keyof typeof PROVIDERS>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const save = useMutation(
    () => put(`/ai/credentials/${provider}`, { apiKey, model: model || undefined }),
    () => {
      setApiKey("");
      keys.reload();
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run();
  };
  return (
    <section className="card stack">
      <h2>AI provider</h2>
      <p className="small secondary">
        Bring your own key. It is encrypted on this server, never shown again, and only used for
        reviews and questions you start. AI usage is billed to your provider account.
      </p>
      <ResourceView resource={keys}>
        {(data) =>
          data.credentials.map((c) => (
            <CredentialRow key={c.provider} credential={c} onRemoved={keys.reload} />
          ))
        }
      </ResourceView>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as keyof typeof PROVIDERS)}
          >
            <LabelOptions labels={PROVIDERS} />
          </select>
        </Field>
        <Field label="API key">
          <input
            type="password"
            autoComplete="off"
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <Field label="Model (optional)">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "anthropic" ? "claude-opus-5-5" : "gpt-5"}
          />
        </Field>
        <div style={{ alignSelf: "end" }}>
          <button className="btn primary" disabled={save.busy}>
            Save key
          </button>
        </div>
      </form>
      <ErrorBox error={save.error} />
    </section>
  );
}

function CredentialRow({
  credential: c,
  onRemoved,
}: {
  credential: CredentialDto;
  onRemoved: () => void;
}) {
  const remove = useMutation(() => del(`/ai/credentials/${c.provider}`), onRemoved);
  return (
    <div className="row">
      <strong>{PROVIDERS[c.provider]}</strong>{" "}
      <span className="muted">
        key ending {c.keyHint}, model {c.model}
      </span>
      {c.active && <span className="badge ai">In use</span>}
      <button className="btn small danger" disabled={remove.busy} onClick={() => remove.run()}>
        Remove
      </button>
      <ErrorBox error={remove.error} />
    </div>
  );
}
