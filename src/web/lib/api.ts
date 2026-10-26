import type { ApiErrorBody } from "../../shared/api-types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.error.code, body.error.message);
  } catch {
    return new ApiError(response.status, "http", `Request failed (${response.status})`);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: isForm ? init.headers : { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const send =
  (method: string) =>
  <T>(path: string, body?: unknown) =>
    api<T>(path, { method, body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export const post = send("POST");
export const put = send("PUT");
export const patch = send("PATCH");
export const del = send("DELETE");

/** The browser's offset from UTC in minutes, east positive, as the API expects. */
export const tzOffset = () => -new Date().getTimezoneOffset();
