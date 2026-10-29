/**
 * The admin desk's request rules, with no React: which version a save is based on, which
 * responses still belong to the current account, and how a refusal is reported.
 *
 * - open(key, version) captures the base version when an item is opened. Revalidation does not
 *   move it, so a refreshed list never makes a stale form look current.
 * - save(...) sends the change with that base version. On success it adopts the server's new
 *   version. A 409 keeps the base (the local form stays; the caller refetches) and never adopts
 *   another editor's version silently.
 * - invalidate() starts a new generation: an account change, a sign-out or a full reload. Any
 *   response that arrives for an older generation, or while the account is no longer active, is
 *   "stale" and must be dropped.
 */
export type Sent = { ok: boolean; status: number; body: Record<string, unknown> };
export type SendFn = (method: string, url: string, payload: unknown) => Promise<Sent>;

export type Outcome =
  | { kind: "ok"; body: Record<string, unknown> }
  /** Someone else changed it. The local form is kept; refetch to show their version. */
  | { kind: "conflict"; message: string }
  /** Signed out, not allowed, or the account changed: stop and clear private data. */
  | { kind: "blocked"; status: number }
  | { kind: "refused"; status: number; message: string; errors: string[] }
  /** The response belongs to an earlier account check; ignore it. */
  | { kind: "stale" }
  /** No request was sent: the account is not active, or the item was never opened. */
  | { kind: "inactive"; message: string };

const text = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === "string" && body.error ? body.error : fallback;

export function createDraftSession(options: { send: SendFn; isActive: () => boolean }) {
  let generation = 0;
  const bases = new Map<string, number>();

  async function request(method: string, url: string, payload: unknown): Promise<Outcome> {
    if (!options.isActive())
      return { kind: "inactive", message: "Your account session is no longer active. Review was stopped." };
    const started = generation;
    const sent = await options.send(method, url, payload);
    if (started !== generation || !options.isActive()) return { kind: "stale" };
    if (sent.ok) return { kind: "ok", body: sent.body };
    const code = typeof sent.body.code === "string" ? sent.body.code : "";
    if (sent.status === 401 || sent.status === 403 || code === "ACCOUNT_CHANGED")
      return { kind: "blocked", status: sent.status || 409 };
    const message = text(sent.body, "The request could not be saved.");
    if (sent.status === 409) return { kind: "conflict", message };
    const errors = Array.isArray(sent.body.errors)
      ? sent.body.errors.filter((e): e is string => typeof e === "string")
      : [];
    return { kind: "refused", status: sent.status, message, errors };
  }

  return {
    /** The current generation, for loads the caller runs itself. */
    generation: () => generation,
    isCurrent: (g: number) => g === generation && options.isActive(),
    /** A new generation: every request still in flight becomes stale. */
    invalidate() {
      generation += 1;
      return generation;
    },
    /** Forget every captured base version and invalidate (account change or sign-out). */
    reset() {
      bases.clear();
      generation += 1;
    },
    open(key: string, version: number) {
      bases.set(key, version);
    },
    baseVersion: (key: string) => bases.get(key) ?? null,
    request,
    /**
     * Sends `change` plus the base version captured at open(), under `field` ("version" for an
     * item, "pointerVersion" for the live release). On success the base becomes `adopt(body)`.
     */
    async save(
      key: string,
      method: string,
      url: string,
      change: Record<string, unknown>,
      adopt: (body: Record<string, unknown>) => number | undefined,
      field = "version",
    ): Promise<Outcome> {
      const base = bases.get(key);
      if (base === undefined) return { kind: "inactive", message: "Select the item again before saving." };
      const outcome = await request(method, url, { ...change, [field]: base });
      if (outcome.kind === "ok") {
        const next = adopt(outcome.body);
        if (typeof next === "number") bases.set(key, next);
      }
      return outcome;
    },
  };
}
export type DraftSession = ReturnType<typeof createDraftSession>;
