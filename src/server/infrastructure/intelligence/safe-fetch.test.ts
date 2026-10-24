import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Resolver, type SafeFetchOptions, safeFetch, vetUrl } from "./safe-fetch";

const fixed =
  (table: Record<string, string[]>): Resolver =>
  async (host) =>
    (table[host] ?? []).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("vetUrl", () => {
  const options = { resolver: fixed({ "feed.example": ["93.184.216.34"] }), allowHttp: false };

  it("accepts an https URL whose host resolves to a public address", async () => {
    await expect(vetUrl("https://feed.example/rss", options)).resolves.toMatchObject({
      address: "93.184.216.34",
    });
  });

  it("refuses plain http unless the opt-in is set", async () => {
    await expect(vetUrl("http://feed.example/rss", options)).rejects.toThrow(/https/);
    await expect(
      vetUrl("http://feed.example/rss", { ...options, allowHttp: true }),
    ).resolves.toBeDefined();
  });

  it.each(["file:///etc/passwd", "ftp://feed.example/", "gopher://feed.example/"])(
    "refuses the scheme of %s",
    async (url) => {
      await expect(vetUrl(url, { ...options, allowHttp: true })).rejects.toThrow();
    },
  );

  it("refuses a host when any of its addresses is private", async () => {
    const resolver = fixed({ "mixed.example": ["93.184.216.34", "10.0.0.7"] });
    await expect(vetUrl("https://mixed.example/", { resolver, allowHttp: false })).rejects.toThrow(
      /not allowed/,
    );
  });

  it.each([
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://169.254.169.254/latest/meta-data/",
    "https://0x7f000001/",
    "https://2130706433/",
  ])("refuses the literal address in %s without asking DNS", async (url) => {
    const resolver = vi.fn(fixed({}));
    await expect(vetUrl(url, { resolver, allowHttp: false })).rejects.toThrow(/not allowed/);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("refuses credentials in the URL and hosts that do not resolve", async () => {
    await expect(vetUrl("https://user:pw@feed.example/", options)).rejects.toThrow();
    await expect(vetUrl("https://nowhere.example/", options)).rejects.toThrow(/resolve/);
  });
});

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server | null = null;

async function serve(handler: Handler): Promise<number> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  const running = server;
  server = null;
  if (!running) return;
  running.closeAllConnections();
  await new Promise((resolve) => running.close(resolve));
});

const rss = (res: ServerResponse, body = "<rss/>") => {
  res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
  res.end(body);
};

// The local test server lives on loopback, so these tests swap in a policy that allows only
// 127.0.0.1. Every other address, including the private targets below, stays forbidden.
function local(resolver: Resolver, overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return {
    resolver,
    allowHttp: true,
    timeoutMs: 2000,
    maxBytes: 1024,
    maxRedirects: 3,
    accept: ["application/rss+xml", "application/xml"],
    isForbidden: (address) => address !== "127.0.0.1",
    ...overrides,
  };
}

describe("safeFetch", () => {
  it("connects to the vetted address and keeps the hostname in the Host header", async () => {
    let host: string | undefined;
    const port = await serve((req, res) => {
      host = req.headers.host;
      rss(res);
    });
    // A rebinding resolver: the second lookup would point somewhere private.
    const answers = [["127.0.0.1"], ["10.0.0.1"]];
    const resolver = vi.fn(async () =>
      (answers.shift() ?? []).map((address) => ({ address, family: 4 as const })),
    );
    const result = await safeFetch(`http://feed.example:${port}/rss`, local(resolver));
    expect(result.body).toBe("<rss/>");
    expect(host).toBe(`feed.example:${port}`);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("re-vets every redirect and refuses one that leads to a private host", async () => {
    const port = await serve((req, res) => {
      res.writeHead(302, { location: "http://internal.example/admin" });
      res.end();
    });
    const resolver = fixed({ "feed.example": ["127.0.0.1"], "internal.example": ["10.0.0.5"] });
    await expect(safeFetch(`http://feed.example:${port}/`, local(resolver))).rejects.toThrow(
      /not allowed/,
    );
  });

  it("follows a redirect to a vetted host", async () => {
    const port = await serve((req, res) => {
      if (req.url === "/old") {
        res.writeHead(301, { location: "/new" });
        res.end();
      } else rss(res, "moved");
    });
    const resolver = fixed({ "feed.example": ["127.0.0.1"] });
    const result = await safeFetch(`http://feed.example:${port}/old`, local(resolver));
    expect(result).toMatchObject({ body: "moved", url: `http://feed.example:${port}/new` });
  });

  it("stops after too many redirects", async () => {
    const port = await serve((req, res) => {
      res.writeHead(302, { location: "/again" });
      res.end();
    });
    const resolver = fixed({ "feed.example": ["127.0.0.1"] });
    await expect(safeFetch(`http://feed.example:${port}/`, local(resolver))).rejects.toThrow(
      /redirect/,
    );
  });

  it("refuses a response that is not a feed content type", async () => {
    const port = await serve((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    });
    const resolver = fixed({ "feed.example": ["127.0.0.1"] });
    await expect(safeFetch(`http://feed.example:${port}/`, local(resolver))).rejects.toThrow(
      /content type/,
    );
  });

  it("aborts a body larger than the cap, even without a Content-Length", async () => {
    const port = await serve((req, res) => {
      res.writeHead(200, { "content-type": "application/xml" });
      res.write("x".repeat(800));
      res.end("y".repeat(800));
    });
    const resolver = fixed({ "feed.example": ["127.0.0.1"] });
    await expect(safeFetch(`http://feed.example:${port}/`, local(resolver))).rejects.toThrow(
      /too large/,
    );
  });

  it("gives up on a server that never answers", async () => {
    const port = await serve(() => undefined);
    const resolver = fixed({ "feed.example": ["127.0.0.1"] });
    await expect(
      safeFetch(`http://feed.example:${port}/`, local(resolver, { timeoutMs: 200 })),
    ).rejects.toThrow(/too long/);
  });
});
