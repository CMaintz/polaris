import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("defaults to a closed, loopback-only instance", () => {
    const config = loadConfig({});
    expect(config.allowSignup).toBe(false);
    expect(config.host).toBe("127.0.0.1");
    expect(config.secureCookies).toBe(false);
  });

  it("only opens sign-up for the exact value true", () => {
    expect(loadConfig({ POLARIS_ALLOW_SIGNUP: "false" }).allowSignup).toBe(false);
    expect(loadConfig({ POLARIS_ALLOW_SIGNUP: "1" }).allowSignup).toBe(false);
    expect(loadConfig({ POLARIS_ALLOW_SIGNUP: "true" }).allowSignup).toBe(true);
  });

  it("keeps the data directory next to the database by default", () => {
    expect(loadConfig({ POLARIS_DB_PATH: "/srv/polaris/db.sqlite" }).dataDir).toMatch(
      /[\\/]srv[\\/]polaris$/,
    );
  });

  it("treats an empty master key as unset", () => {
    expect(loadConfig({ POLARIS_MASTER_KEY: "" }).masterKey).toBeUndefined();
  });
});
