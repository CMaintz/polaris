import { buildContainer, type Overrides } from "./composition";
import type { Config } from "./config";
import { ScryptHasher } from "./infrastructure/crypto/password";

export const TEST_PASSWORD = "correct horse battery";

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    dbPath: ":memory:",
    dataDir: ":memory:",
    port: 0,
    host: "127.0.0.1",
    secureCookies: false,
    allowSignup: true,
    masterKey: Buffer.alloc(32, 7).toString("base64"),
    webDistDir: "./dist/web",
    maxUploadBytes: 10 * 1024 * 1024,
    feedsAllowHttp: false,
    linkedin: null,
    ...overrides,
  };
}

/** A container on an in-memory database with a cheap password hash and a settable clock. */
export function testContainer(config: Partial<Config> = {}, overrides: Overrides = {}) {
  let now = new Date("2026-03-15T12:00:00Z");
  const container = buildContainer(testConfig(config), {
    clock: () => now,
    hasher: new ScryptHasher({ N: 2 ** 10, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }),
    worker: { baseBackoffMs: 1000 },
    ...overrides,
  });
  return {
    ...container,
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
}

export type TestContainer = ReturnType<typeof testContainer>;

export async function signedInClient(container: TestContainer, email = "ada@example.com") {
  const response = await container.api.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (response.status !== 201) throw new Error(`register failed: ${await response.text()}`);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const { user } = (await response.json()) as { user: { id: string } };
  const request = (path: string, init: RequestInit = {}) =>
    container.api.request(path, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...init.headers },
    });
  return { userId: user.id, cookie, request };
}

/** Uploads files to /imports as a browser would (multipart, with an Origin header). */
export function uploadFiles(
  container: TestContainer,
  client: { cookie: string },
  files: Record<string, Uint8Array>,
) {
  const form = new FormData();
  for (const [name, bytes] of Object.entries(files)) {
    form.append("files", new File([new Uint8Array(bytes)], name));
  }
  return container.api.request("/imports", {
    method: "POST",
    headers: { cookie: client.cookie, origin: "http://localhost" },
    body: form,
  });
}

export type Client = Awaited<ReturnType<typeof signedInClient>>;

/** Uploads files, runs the queued import and returns the finished job. */
export async function importAndWait(
  container: TestContainer,
  client: Client,
  files: Record<string, Uint8Array>,
) {
  const response = await uploadFiles(container, client, files);
  if (response.status !== 202) throw new Error(`upload failed: ${await response.text()}`);
  const { job } = (await response.json()) as { job: { id: string } };
  await container.worker.drain();
  const done = await (await client.request(`/jobs/${job.id}`)).json();
  return (done as { job: { status: string; error: string | null; result: unknown } }).job;
}
