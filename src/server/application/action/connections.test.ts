import { describe, expect, it } from "vitest";
import type { Platform } from "../../domain/accounts";
import type { Account } from "../content/ports";
import { ValidationError } from "../errors";
import { ConnectionService } from "./connections";
import type { ConnectableProvider, OAuthState } from "./provider-ports";

function account(platform: Platform): Account {
  return {
    id: "acc",
    userId: "u",
    platform,
    label: platform,
    displayName: null,
    headline: null,
    profileUrl: null,
  };
}

function service(platform: Platform) {
  const saved: OAuthState[] = [];
  const linkedin: ConnectableProvider = {
    id: "linkedin-api",
    label: "LinkedIn",
    mode: "api",
    platform: "linkedin",
    connectionStatus: async () => ({ state: "not_connected", displayName: null, expiresAt: null }),
    publish: async () => ({ externalId: null, url: null }),
    authorizationUrl: (state) => `https://linkedin.example/auth?state=${state}`,
    completeAuthorization: async () => undefined,
    disconnect: async () => undefined,
  };
  const connections = new ConnectionService({
    providers: [linkedin],
    states: { save: async (_hash, state) => void saved.push(state), take: async () => null },
    findAccount: async () => account(platform),
    audit: { record: async () => undefined },
    clock: () => new Date("2026-03-15T12:00:00Z"),
  });
  return { connections, saved };
}

describe("connecting a publishing provider", () => {
  it("refuses to connect LinkedIn to an account of another platform", async () => {
    const { connections, saved } = service("other");
    const error = await connections.start("u", "linkedin-api").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toMatch(/LinkedIn account/);
    expect(saved).toHaveLength(0);
  });

  it("connects LinkedIn to a LinkedIn account", async () => {
    const { connections, saved } = service("linkedin");
    expect(await connections.start("u", "linkedin-api")).toMatch(/^https:\/\/linkedin.example/);
    expect(saved).toEqual([expect.objectContaining({ accountId: "acc" })]);
  });
});
