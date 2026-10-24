import { lookup } from "node:dns/promises";
import { type ClientRequest, type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { type LookupFunction, isIP } from "node:net";
import { isForbiddenAddress } from "./address-policy";

// Fetches a URL a user typed in, from the server, without letting it reach the server's own
// network (SSRF, docs/09, ADR 0020). Global fetch cannot pin the connect address without the
// undici package, so this uses node:http(s) with a `lookup` that returns the vetted address.

export type Resolver = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => ({
    address: a.address,
    family: a.family === 6 ? 6 : 4,
  }));

export interface SafeFetchOptions {
  resolver: Resolver;
  allowHttp: boolean;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  accept: readonly string[];
  /** Replaced only by tests, whose local server lives on loopback. */
  isForbidden?: (address: string) => boolean;
}

export interface FetchedDocument {
  url: string;
  contentType: string;
  body: string;
}

/** A failure whose message is safe to store and show: it never echoes a response body. */
export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

interface Vetted {
  url: URL;
  address: string;
  family: 4 | 6;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function parseTarget(raw: string, allowHttp: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("That is not a valid URL");
  }
  const http = url.protocol === "http:" && allowHttp;
  if (url.protocol !== "https:" && !http) throw new FetchError("Only https URLs are allowed");
  if (url.username || url.password) throw new FetchError("URLs with credentials are not allowed");
  return url;
}

async function addressesOf(host: string, resolver: Resolver) {
  if (isIP(host)) return [{ address: host, family: isIP(host) as 4 | 6 }];
  try {
    return await resolver(host);
  } catch {
    return [];
  }
}

/** Parses, resolves and checks a URL. Every address must be public, not just the first. */
export async function vetUrl(
  raw: string,
  options: Pick<SafeFetchOptions, "resolver" | "allowHttp" | "isForbidden">,
): Promise<Vetted> {
  const url = parseTarget(raw, options.allowHttp);
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const addresses = await addressesOf(host, options.resolver);
  const first = addresses[0];
  if (!first) throw new FetchError(`Could not resolve ${host}`);
  const forbidden = options.isForbidden ?? isForbiddenAddress;
  if (addresses.some((a) => forbidden(a.address))) {
    throw new FetchError(`${host} points to an address that is not allowed`);
  }
  return { url, address: first.address, family: first.family };
}

function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return ((_host: string, opts: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (opts.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  }) as unknown as LookupFunction;
}

function open(
  target: Vetted,
  accept: readonly string[],
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const send = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req: ClientRequest = send(target.url, {
      method: "GET",
      headers: { accept: accept.join(", ") },
      lookup: pinnedLookup(target.address, target.family),
      signal,
    });
    req.on("response", resolve);
    req.on("error", () =>
      reject(new FetchError(signal.aborted ? "The server took too long" : "Could not connect")),
    );
    req.end();
  });
}

function checkType(response: IncomingMessage, accept: readonly string[]): string {
  const type = (response.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!accept.includes(type)) {
    throw new FetchError(`Unexpected content type "${type || "none"}"`);
  }
  return type;
}

function readBody(response: IncomingMessage, maxBytes: number, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        response.destroy();
        reject(new FetchError(`The response is too large (over ${maxBytes} bytes)`));
      } else chunks.push(chunk);
    });
    response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    response.on("error", () =>
      reject(new FetchError(signal.aborted ? "The server took too long" : "The connection failed")),
    );
  });
}

async function hop(target: Vetted, options: SafeFetchOptions, signal: AbortSignal) {
  const response = await open(target, options.accept, signal);
  const status = response.statusCode ?? 0;
  if (REDIRECTS.has(status) && response.headers.location) {
    response.resume();
    return { redirect: new URL(response.headers.location, target.url).toString() };
  }
  if (status < 200 || status >= 300) {
    response.resume();
    throw new FetchError(`The server answered with status ${status}`);
  }
  const contentType = checkType(response, options.accept);
  const length = Number(response.headers["content-length"] ?? 0);
  if (length > options.maxBytes) {
    response.destroy();
    throw new FetchError(`The response is too large (over ${options.maxBytes} bytes)`);
  }
  const body = await readBody(response, options.maxBytes, signal);
  return { document: { url: target.url.toString(), contentType, body } };
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<FetchedDocument> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let next = raw;
  for (let hops = 0; hops <= options.maxRedirects; hops++) {
    const result = await hop(await vetUrl(next, options), options, signal);
    if (result.document) return result.document;
    next = result.redirect;
  }
  throw new FetchError("Too many redirects");
}
