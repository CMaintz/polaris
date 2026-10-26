import { describe, expect, it } from "vitest";
import { ScryptHasher } from "../infrastructure/crypto/password";
import { TEST_PASSWORD, signedInClient, testContainer } from "../test-support";

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("auth API", () => {
  it("signs a registered user in and returns them from /auth/me", async () => {
    const container = testContainer();
    const client = await signedInClient(container, "ada@example.com");
    const me = await client.request("/auth/me");
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email: "ada@example.com" } });
  });

  it("rejects requests without a session", async () => {
    const response = await testContainer().api.request("/auth/me");
    expect(response.status).toBe(401);
  });

  it("refuses a second sign-up when sign-up is closed, but not the first", async () => {
    const container = testContainer({ allowSignup: false });
    await signedInClient(container, "owner@example.com");
    const second = await container.api.request(
      "/auth/register",
      json({ email: "stranger@example.com", password: TEST_PASSWORD }),
    );
    expect(second.status).toBe(403);
  });

  it("does not reveal whether the email or the password was wrong", async () => {
    const container = testContainer();
    await signedInClient(container, "ada@example.com");
    const wrongPassword = await container.api.request(
      "/auth/login",
      json({ email: "ada@example.com", password: "not the password" }),
    );
    const unknownEmail = await container.api.request(
      "/auth/login",
      json({ email: "nobody@example.com", password: TEST_PASSWORD }),
    );
    expect(wrongPassword.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
  });

  it("rejects malformed bodies with a 400 that names the problem", async () => {
    const container = testContainer();
    const notJson = await container.api.request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(notJson.status).toBe(400);
    const missing = await container.api.request("/auth/register", json({ email: "a@b.co" }));
    expect(missing.status).toBe(400);
    expect(JSON.stringify(await missing.json())).toContain("password");
  });

  it("rejects short passwords and duplicate emails", async () => {
    const container = testContainer();
    const short = await container.api.request(
      "/auth/register",
      json({ email: "ada@example.com", password: "short" }),
    );
    expect(short.status).toBe(400);
    await signedInClient(container, "ada@example.com");
    const duplicate = await container.api.request(
      "/auth/register",
      json({ email: "ADA@example.com", password: TEST_PASSWORD }),
    );
    expect(duplicate.status).toBe(409);
  });

  it("spends a password hash on unknown emails too, so timing does not reveal accounts", async () => {
    let verifications = 0;
    const hasher = new ScryptHasher({ N: 2 ** 10, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    const counting = {
      hash: (password: string) => hasher.hash(password),
      verify: (password: string, stored: string) => {
        verifications += 1;
        return hasher.verify(password, stored);
      },
    };
    const container = testContainer({}, { hasher: counting });
    await container.api.request(
      "/auth/login",
      json({ email: "nobody@example.com", password: TEST_PASSWORD }),
    );
    expect(verifications).toBe(1);
  });

  it("logs in case-insensitively by email", async () => {
    const container = testContainer();
    await signedInClient(container, "ada@example.com");
    const response = await container.api.request(
      "/auth/login",
      json({ email: " ADA@Example.com ", password: TEST_PASSWORD }),
    );
    expect(response.status).toBe(200);
  });

  it("ends the session on logout", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    await client.request("/auth/logout", { method: "POST" });
    expect((await client.request("/auth/me")).status).toBe(401);
  });

  it("expires sessions after 30 days", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    container.setNow("2026-04-15T12:00:00Z");
    expect((await client.request("/auth/me")).status).toBe(401);
  });

  it("stores only a hash of the session token", async () => {
    const container = testContainer();
    const client = await signedInClient(container);
    const token = client.cookie.split("=")[1];
    const rows = container.db.prepare("SELECT token_hash FROM sessions").all() as {
      token_hash: string;
    }[];
    expect(rows.map((r) => r.token_hash)).not.toContain(token);
  });

  it("rejects a cross-origin form post", async () => {
    const container = testContainer();
    const response = await container.api.request("http://polaris.local/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://evil.example",
      },
      body: "email=a&password=b",
    });
    expect(response.status).toBe(403);
  });
});

describe("job API", () => {
  it("hides another user's job as if it did not exist", async () => {
    const container = testContainer();
    const owner = await signedInClient(container, "owner@example.com");
    const other = await signedInClient(container, "other@example.com");
    const job = await container.jobs.enqueue(
      { userId: owner.userId, type: "import", payload: { label: "Shares.csv" } },
      "2026-03-15T12:00:00Z",
    );
    expect((await owner.request(`/jobs/${job.id}`)).status).toBe(200);
    expect((await other.request(`/jobs/${job.id}`)).status).toBe(404);
    const listed = (await (await other.request("/jobs")).json()) as { jobs: unknown[] };
    expect(listed.jobs).toEqual([]);
  });
});
