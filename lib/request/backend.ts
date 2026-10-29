/**
 * BackendClient: server-to-server calls from the Worker to the game backend, as the signed-in
 * member. It sends only `Authorization: Bearer <the member's Firebase ID token>`: no cookie, no
 * service secret, and the token is never logged. Relative imports only.
 */
import type { Bearer } from "./principal.ts";

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/** No `GAME_API_BASE_URL` is configured. */
export class BackendNotConnected extends Error {
  constructor() {
    super("No game backend is configured.");
  }
}
/** The backend answered with an error, or could not be reached (`status` 0). */
export class BackendError extends Error {
  status: number;
  /** The backend's stable `error.code`, e.g. player_not_found; "" when absent. */
  code: string;
  /** Seconds, from `Retry-After`. */
  retryAfter?: number;
  constructor(status: number, code: string, retryAfter?: number) {
    super(`Game backend answered ${status}${code ? ` ${code}` : ""}.`);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export type BackendClient = {
  getJson(path: string): Promise<unknown>;
  send(method: string, path: string, body: unknown, contentType?: string): Promise<unknown>;
};

export function backendClient(
  options: { baseUrl?: string; fetch?: FetchFn; timeoutMs?: number },
  bearer: Bearer,
): BackendClient {
  const base = options.baseUrl?.trim().replace(/\/+$/, "");
  const call = options.fetch ?? ((input, init) => fetch(input, init));

  async function request(method: string, path: string, body?: unknown, contentType = "application/json") {
    if (!base) throw new BackendNotConnected();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${bearer.reveal()}`,
    };
    if (body !== undefined) headers["Content-Type"] = contentType;
    let response: Response;
    try {
      response = await call(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : (body as BodyInit),
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
    } catch {
      throw new BackendError(0, "unreachable");
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        parsed && typeof parsed === "object" && "error" in parsed && parsed.error && typeof parsed.error === "object"
          ? String((parsed.error as { code?: unknown }).code ?? "")
          : "";
      const header = response.headers.get("Retry-After");
      const retry = header === null || header.trim() === "" ? NaN : Number(header);
      throw new BackendError(response.status, code, Number.isFinite(retry) && retry >= 0 ? retry : undefined);
    }
    return parsed;
  }

  return {
    getJson: (path) => request("GET", path),
    send: (method, path, body, contentType) => request(method, path, body, contentType),
  };
}
