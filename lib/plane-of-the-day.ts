/**
 * Today's Plane of the Day from the game backend (`GET /v1/public/plane-of-the-day`, contract 0.33.0, schemas
 * `PlaneOfTheDay`, `PublicFeature`, `ImageRef`, `MediaLicence`). Anonymous: the website's server asks on behalf of
 * every guest, so all guests share one per-IP budget.
 *
 * One in-process cache keyed by the viewer's calendar day (not the time zone: hundreds of zones map to two or
 * three live days). Per day: one request in flight and a 60 s fresh window. Signed image links live for hours
 * (24 h in the contract), so each refresh renews them long before the earliest `expiresAt`; the expiry only
 * matters for a stale copy, where a link past it is served as no image, never a dead one. The last good copy is
 * served for up to a day when the backend fails, times out or answers 429 (Retry-After honoured, up to 10 min).
 * A body that doesn't match the contract counts as a failure.
 * `instagram` is checked and dropped: it is not gated on the photographer's display consent yet (WB-HOM-05).
 * Relative imports only (unit-tested with node --test).
 */

export type PotdLicence = {
  credit: string | null;
  licenceName: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
  attributionText: string | null;
};
export type PotdImage = {
  url: string | null;
  expiresAt: string | null;
  width: number;
  height: number;
  licence: PotdLicence;
};
export type PotdFeature = {
  id: string;
  date: string;
  title: string;
  aircraft: string;
  description: string;
  image: PotdImage;
};
export type PlaneOfTheDay = { day: string; features: PotdFeature[] };

/** `ok`: the day and its features (possibly none). `unavailable`: no backend configured, or no good copy. */
export type PotdResult = { state: "ok"; day: string; features: PotdFeature[] } | { state: "unavailable" };

export const POTD_FRESH_MS = 60 * 1000;
export const POTD_STALE_MS = 24 * 60 * 60 * 1000;
export const POTD_TIMEOUT_MS = 2500;
const RETRY_AFTER_MAX_MS = 10 * 60 * 1000;
const MAX_DAYS = 8;

/** The contract's `timeZone` pattern; offset zones are refused by the backend, so they are refused here too. */
export const TIME_ZONE = /^[A-Za-z][A-Za-z0-9_/-]{0,63}$/;
const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const FEATURE_ID = /^ed-[1-9][0-9]{0,14}$/;
const MEDIA_ID = /^med-[1-9][0-9]{0,14}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HTTP_URL = /^https?:\/\//;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value);
const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4096;
const isInstant = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
/** An https link only: the page is served over https and must not load or link mixed content. */
const protocolOf = (value: string) => {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
};
const httpsUrl = (value: string) => protocolOf(value) === "https:";
const nullableText = (value: unknown, min: number, max: number): value is string | null =>
  value === null || (typeof value === "string" && value.length >= min && value.length <= max);
const nullableLink = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value.length <= 2048 && HTTP_URL.test(value));
/** A link the page may show: https only, anything else is dropped (shown as no line). */
const shownLink = (value: string | null) => (value && httpsUrl(value) ? value : null);
const shownText = (value: string | null) => (value && value.trim() ? value.trim() : null);

function parseLicence(value: unknown): PotdLicence | null {
  const keys = ["credit", "licenceName", "licenceUrl", "sourceUrl", "attributionText", "creditRequired"];
  if (!isObject(value) || !exactKeys(value, keys)) return null;
  const { credit, licenceName, licenceUrl, sourceUrl, attributionText, creditRequired } = value;
  if (!nullableText(credit, 1, 200) || !nullableText(licenceName, 1, 200)) return null;
  if (!nullableLink(licenceUrl) || !nullableLink(sourceUrl)) return null;
  if (!nullableText(attributionText, 0, 1000) || typeof creditRequired !== "boolean") return null;
  return {
    credit: shownText(credit),
    licenceName: shownText(licenceName),
    licenceUrl: shownLink(licenceUrl),
    sourceUrl: shownLink(sourceUrl),
    attributionText: shownText(attributionText),
  };
}

function parseImage(value: unknown): PotdImage | null {
  const keys = ["mediaId", "version", "sha256", "url", "expiresAt", "reason", "contentType", "width", "height", "licence"];
  if (!isObject(value) || !exactKeys(value, keys)) return null;
  const { mediaId, version, sha256, url, expiresAt, reason, contentType, width, height } = value;
  if (typeof mediaId !== "string" || !MEDIA_ID.test(mediaId)) return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) return null;
  if (contentType !== "image/jpeg" && contentType !== "image/png") return null;
  if (!isSize(width) || !isSize(height)) return null;
  const signed = typeof url === "string" && isInstant(expiresAt) && reason === null;
  const unsigned = url === null && expiresAt === null && reason === "cdn_not_configured";
  if (!signed && !unsigned) return null;
  if (signed && protocolOf(url as string) === null) return null;
  const licence = parseLicence(value.licence);
  if (!licence) return null;
  // A signed link that isn't https is valid contract-wise but would be mixed content: show no image.
  const shown = signed && httpsUrl(url as string);
  return {
    url: shown ? (url as string) : null,
    expiresAt: shown ? (expiresAt as string) : null,
    width,
    height,
    licence,
  };
}

function parseFeature(value: unknown): PotdFeature | null {
  const keys = ["id", "date", "title", "aircraft", "photographer", "instagram", "description", "image"];
  if (!isObject(value) || !exactKeys(value, keys)) return null;
  const { id, date, title, aircraft, photographer, instagram, description } = value;
  if (typeof id !== "string" || !FEATURE_ID.test(id) || !isDay(date)) return null;
  for (const field of [title, aircraft, photographer, instagram, description])
    if (typeof field !== "string") return null;
  const image = parseImage(value.image);
  if (!image) return null;
  // `photographer` is staff-typed and `instagram` is not consent-gated: neither leaves this module.
  return { id, date, title: title as string, aircraft: aircraft as string, description: description as string, image };
}

/** Checks a `PlaneOfTheDay` body. Returns null when anything doesn't match the contract. */
export function parsePlaneOfTheDay(body: unknown): PlaneOfTheDay | null {
  if (!isObject(body) || !exactKeys(body, ["day", "features"])) return null;
  const { day, features } = body;
  if (!isDay(day) || !Array.isArray(features) || features.length > 100) return null;
  const out: PotdFeature[] = [];
  for (const feature of features) {
    const parsed = parseFeature(feature);
    if (!parsed) return null;
    out.push(parsed);
  }
  return { day, features: out };
}

export type PotdDeps = {
  /** The backend base URL (`GAME_API_BASE_URL`); undefined or "" = not connected. */
  baseUrl: () => string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

type Entry = {
  copy: { day: string; features: PotdFeature[]; okAt: number } | null;
  nextCheckAt: number;
  inFlight: Promise<void> | null;
};

export function createPlaneOfTheDayCache(deps: PotdDeps) {
  const now = deps.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function entryFor(day: string): Entry {
    let entry = entries.get(day);
    if (!entry) {
      entry = { copy: null, nextCheckAt: 0, inFlight: null };
      entries.set(day, entry);
      // Only a few days are ever live (the viewers' zones span at most three); drop the oldest keys.
      while (entries.size > MAX_DAYS) entries.delete([...entries.keys()].sort()[0]);
    }
    return entry;
  }

  async function refresh(entry: Entry, baseUrl: string, timeZone: string): Promise<void> {
    const fetchImpl = deps.fetch ?? fetch;
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/public/plane-of-the-day?timeZone=${encodeURIComponent(timeZone)}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? POTD_TIMEOUT_MS),
      });
    } catch {
      entry.nextCheckAt = now() + POTD_FRESH_MS;
      return;
    }
    if (response.status === 200) {
      const parsed = parsePlaneOfTheDay(await response.json().catch(() => null));
      if (parsed) {
        entry.copy = { ...parsed, okAt: now() };
        entry.nextCheckAt = now() + POTD_FRESH_MS;
        return;
      }
    } else {
      await response.body?.cancel().catch(() => {});
    }
    // 429, 5xx, an unexpected status or a malformed body: keep the last good copy and wait before asking again.
    const retryAfter = Number(response.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, RETRY_AFTER_MAX_MS) : 0;
    entry.nextCheckAt = now() + Math.max(POTD_FRESH_MS, wait);
  }

  /** The newest good copy kept for an earlier day: its features are all due on or before this day too. */
  function earlierCopy(day: string) {
    const earlier = [...entries.keys()].filter((key) => key < day && entries.get(key)?.copy).sort();
    return earlier.length ? entries.get(earlier[earlier.length - 1])!.copy : null;
  }

  function view(entry: Entry, day: string): PotdResult {
    // A new day the backend hasn't answered yet (it is down, or answered 429) falls back to yesterday's copy.
    const copy = entry.copy ?? earlierCopy(day);
    if (!copy || now() - copy.okAt >= POTD_STALE_MS) return { state: "unavailable" };
    const at = now();
    // Links are checked when served: a stale copy past a link's expiry shows no image, never a dead one.
    // Always labelled with the viewer's day (the key), and nothing dated after it: near midnight the backend's
    // clock may already be on the next day, and its feature must not reach viewers still on this one.
    const features = copy.features.filter((f) => f.date <= day).map((f) =>
      f.image.expiresAt && Date.parse(f.image.expiresAt) <= at
        ? { ...f, image: { ...f.image, url: null, expiresAt: null } }
        : f,
    );
    return { state: "ok", day, features };
  }

  /**
   * `day` is the viewer's day the caller computed from `timeZone` (the cache key); `timeZone` must already be
   * checked against `TIME_ZONE` and `Intl`. The answer is always labelled `day`, with features dated after it left out.
   */
  return async function getPlaneOfTheDay(timeZone: string, day: string): Promise<PotdResult> {
    const baseUrl = deps.baseUrl();
    if (!baseUrl) return { state: "unavailable" };
    const entry = entryFor(day);
    if (now() >= entry.nextCheckAt) {
      entry.inFlight ??= refresh(entry, baseUrl, timeZone).finally(() => {
        entry.inFlight = null;
      });
      await entry.inFlight;
    }
    return view(entry, day);
  };
}
