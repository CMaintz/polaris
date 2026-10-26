import { LinkedInApiError } from "../../application/refresh/ports";
import { queryString } from "./restli";

const BASE_URL = "https://api.linkedin.com/rest";
const TIMEOUT_MS = 30_000;

/** One member's read-only session against LinkedIn's versioned REST API. */
export class LinkedInRestClient {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly token: string,
    /** LinkedIn-Version, YYYYMM; it decides the response shape (see responses.ts). */
    private readonly apiVersion: string,
  ) {}

  async get(resource: string, params: Record<string, string>): Promise<unknown> {
    const response = await this.send(`${BASE_URL}/${resource}?${queryString(params)}`);
    if (!response.ok) throw failure(response.status);
    return response.json();
  }

  private async send(url: string): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        headers: {
          authorization: `Bearer ${this.token}`,
          "linkedin-version": this.apiVersion,
          "x-restli-protocol-version": "2.0.0",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new LinkedInApiError("Could not reach LinkedIn", "unavailable");
    }
  }
}

// LinkedIn documents no rate limit for these endpoints, so a 429 is simply retried later.
// The response body is left out of every message: it can echo request details.
function failure(status: number): LinkedInApiError {
  if (status === 401)
    return new LinkedInApiError("LinkedIn rejected the stored sign-in", "reconnect");
  if (status === 429 || status >= 500)
    return new LinkedInApiError(`LinkedIn is unavailable right now (${status})`, "unavailable");
  if (status === 403)
    return new LinkedInApiError(
      "LinkedIn refused access to your statistics; reconnect LinkedIn and allow it",
      "refused",
    );
  return new LinkedInApiError(`LinkedIn refused the request (${status})`, "refused");
}
