/**
 * The published FAQ from the game backend (`GET /v1/public/faq`, contract 0.33.0, `FaqPublic`).
 * Tokenless: the website's server asks on behalf of every guest, so all guests share one per-IP budget.
 * One in-process cache: fresh for 60 s (one request in flight), the last good copy is served for up to a day
 * when the backend fails or answers 429, and a body that doesn't match the contract counts as a failure.
 * Relative imports only (unit-tested with node --test).
 */

export type FaqEntry = { id: string; question: string; answer: string };
export type FaqCategory = { id: string; title: string; entries: FaqEntry[] };
export type Faq = { version: number; publishedAt: string; categories: FaqCategory[] };

/** `published`: show it. `none`: nothing published yet (404) or no backend configured. `unavailable`: no copy. */
export type FaqResult = { state: "published"; faq: Faq } | { state: "none" } | { state: "unavailable" };

export const FAQ_FRESH_MS = 60 * 1000;
export const FAQ_STALE_MS = 24 * 60 * 60 * 1000;
export const FAQ_TIMEOUT_MS = 2500;
const RETRY_AFTER_MAX_MS = 10 * 60 * 1000;

const ID = /^[a-z0-9-]{1,64}$/;
const MAX_CATEGORIES = 30;
const MAX_ENTRIES = 300;
const codePoints = (text: string) => [...text].length;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, max: number, multiline: boolean): value is string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  codePoints(value) <= max &&
  (multiline || !value.includes("\n"));

/** Checks a `FaqPublic` body. Returns null when anything doesn't match the contract. */
export function parseFaqPublic(body: unknown): Faq | null {
  if (!isObject(body) || !exactKeys(body, ["format", "version", "publishedAt", "categories"])) return null;
  const { format, version, publishedAt, categories } = body;
  if (format !== "faq.v1") return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) return null;
  if (!Array.isArray(categories) || categories.length > MAX_CATEGORIES) return null;
  const categoryIds = new Set<string>();
  const entryIds = new Set<string>();
  const out: FaqCategory[] = [];
  for (const category of categories) {
    if (!isObject(category) || !exactKeys(category, ["id", "title", "entries"])) return null;
    const { id, title, entries } = category;
    if (typeof id !== "string" || !ID.test(id) || categoryIds.has(id)) return null;
    if (!text(title, 80, false) || !Array.isArray(entries)) return null;
    categoryIds.add(id);
    const parsed: FaqEntry[] = [];
    for (const entry of entries) {
      if (!isObject(entry) || !exactKeys(entry, ["id", "question", "answer"])) return null;
      const { id: entryId, question, answer } = entry;
      if (typeof entryId !== "string" || !ID.test(entryId) || entryIds.has(entryId)) return null;
      if (!text(question, 200, false) || !text(answer, 2000, true)) return null;
      entryIds.add(entryId);
      parsed.push({ id: entryId, question, answer });
    }
    out.push({ id, title, entries: parsed });
  }
  if (entryIds.size > MAX_ENTRIES) return null;
  return { version, publishedAt, categories: out };
}

/** Categories that have entries; the contract allows empty ones and the page hides them. */
export const visibleCategories = (faq: Faq) => faq.categories.filter((category) => category.entries.length > 0);

export type FaqDeps = {
  /** The backend base URL (`GAME_API_BASE_URL`); undefined or "" = not connected. */
  baseUrl: () => string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

type Known = { kind: "faq"; faq: Faq; etag: string | null; okAt: number } | { kind: "none" };

export function createFaqCache(deps: FaqDeps) {
  const now = deps.now ?? Date.now;
  let known: Known | null = null;
  let nextCheckAt = 0;
  let inFlight: Promise<void> | null = null;

  const view = (): FaqResult => {
    if (known?.kind === "none") return { state: "none" };
    if (known?.kind === "faq" && now() - known.okAt < FAQ_STALE_MS) return { state: "published", faq: known.faq };
    return { state: "unavailable" };
  };

  async function refresh(baseUrl: string): Promise<void> {
    const fetchImpl = deps.fetch ?? fetch;
    const etag = known?.kind === "faq" ? known.etag : null;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/public/faq`, {
        headers: { Accept: "application/json", ...(etag ? { "If-None-Match": etag } : {}) },
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? FAQ_TIMEOUT_MS),
      });
    } catch {
      nextCheckAt = now() + FAQ_FRESH_MS;
      return;
    }
    if (response.status === 304 && known?.kind === "faq") {
      known = { ...known, okAt: now() };
      nextCheckAt = now() + FAQ_FRESH_MS;
      return;
    }
    if (response.status === 404) {
      known = { kind: "none" };
      nextCheckAt = now() + FAQ_FRESH_MS;
      return;
    }
    if (response.status === 200) {
      const faq = parseFaqPublic(await response.json().catch(() => null));
      if (faq) {
        known = { kind: "faq", faq, etag: response.headers.get("ETag"), okAt: now() };
        nextCheckAt = now() + FAQ_FRESH_MS;
        return;
      }
    }
    // 429, 5xx, an unexpected status or a malformed body: keep the last good copy and wait before asking again.
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, RETRY_AFTER_MAX_MS) : 0;
    nextCheckAt = now() + Math.max(FAQ_FRESH_MS, wait);
  }

  return async function getFaq(): Promise<FaqResult> {
    const baseUrl = deps.baseUrl();
    if (!baseUrl) return { state: "none" };
    if (now() >= nextCheckAt) {
      inFlight ??= refresh(baseUrl).finally(() => {
        inFlight = null;
      });
      await inFlight;
    }
    return view();
  };
}
