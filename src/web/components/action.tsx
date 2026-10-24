import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent, ReactNode } from "react";
import type { ConnectionDto, LengthDto } from "../../shared/action-types";
import { del, post } from "../lib/api";
import { formatDate } from "../lib/format";
import { type useStartJob, useResource } from "../lib/hooks";
import { type Mutation, useMutation } from "../lib/mutation";
import { ResourceView } from "./resource";
import { ErrorBox, JobLine } from "./ui";

const STATE_LABEL: Record<ConnectionDto["state"], string> = {
  connected: "Connected",
  not_connected: "Not connected",
  expired: "Sign-in expired, reconnect",
  not_configured: "Not set up on this server",
};

export function Connections() {
  const list = useResource<{ connections: ConnectionDto[] }>("/action/connections");
  const [params] = useSearchParams();
  const message = params.get("publishing") === "error" ? params.get("message") : null;
  return (
    <section className="card stack" aria-label="Publishing connections">
      <h2>Publishing connections</h2>
      <p className="small muted">
        Polaris posts only drafts you approved and scheduled, through LinkedIn's official API.
        Disconnecting deletes the stored sign-in. You can also remove Polaris under LinkedIn's
        Settings, Data privacy, Permitted services.
      </p>
      {params.get("publishing") === "connected" && (
        <div className="banner">LinkedIn connected.</div>
      )}
      {message && <ErrorBox error={new Error(message)} />}
      <ResourceView resource={list}>
        {({ connections }) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <ConnectionRow key={c.id} connection={c} onChange={list.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ResourceView>
    </section>
  );
}

function ConnectionRow({
  connection: c,
  onChange,
}: {
  connection: ConnectionDto;
  onChange: () => void;
}) {
  const connect = useMutation(
    useCallback(async () => {
      const { url } = await post<{ url: string }>(`/action/connections/${c.id}/connect`);
      window.location.assign(url);
    }, [c.id]),
  );
  const disconnect = useMutation(
    useCallback(() => del(`/action/connections/${c.id}`), [c.id]),
    onChange,
  );
  const connected = c.state === "connected" || c.state === "expired";
  return (
    <tr>
      <td>{c.label}</td>
      <td>
        {c.mode === "handoff" ? "Always available" : STATE_LABEL[c.state]}
        {c.displayName && ` as ${c.displayName}`}
        <ErrorBox error={connect.error ?? disconnect.error} />
      </td>
      <td>{c.expiresAt ? formatDate(c.expiresAt) : "not available"}</td>
      <td>
        {c.connectable && c.state !== "not_configured" && (
          <div className="row">
            {c.state !== "connected" && (
              <button
                className="btn small primary"
                disabled={connect.busy}
                onClick={() => connect.run()}
              >
                {c.state === "expired" ? "Reconnect" : "Connect"}
              </button>
            )}
            {connected && (
              <button
                className="btn small danger"
                disabled={disconnect.busy}
                onClick={() => disconnect.run()}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function LengthLine({ length }: { length: LengthDto }) {
  return (
    <span className={`small${length.over ? "" : " muted"}`} role="status">
      {length.length} of {length.limit} characters
      {length.over && " - too long for LinkedIn, shorten it before approving"}
    </span>
  );
}

export function usePost(path: string, onDone?: () => void): Mutation<[body?: object]> {
  return useMutation(
    useCallback((body?: object) => post(path, body), [path]),
    onDone,
  );
}

export function JobFormCard(props: {
  title: string;
  intro: string;
  job: ReturnType<typeof useStartJob>;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="card stack" aria-label={props.title} onSubmit={submit}>
      <h2>{props.title}</h2>
      <p className="small muted">{props.intro}</p>
      {props.children}
      <ErrorBox error={props.job.error} />
      <JobLine job={props.job.job} />
      <div>
        <button className="btn primary" disabled={props.job.running}>
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}
