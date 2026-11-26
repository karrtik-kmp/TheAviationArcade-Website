/**
 * Server-side copy of the Termageddon policy embeds (client's embeds, 2026-11-24).
 *
 * The browser used to ask Termageddon for the policy only after the page's JavaScript had loaded, and
 * Termageddon answers each request in about half a second with `no-cache`. Fetching it here, with the
 * same render URL and `origin` the embed script uses, puts the policy in the page's own HTML. Copies are
 * kept per policy and page URL for an hour; when a refresh fails a copy up to a day old is served
 * instead, and with none the page falls back to loading the policy in the browser.
 */

export const POLICY_FRESH_MS = 60 * 60 * 1000;
export const POLICY_STALE_MS = 24 * 60 * 60 * 1000;
export const POLICY_TIMEOUT_MS = 2500;
const MAX_ENTRIES = 32;

type Entry = { html: string; fetchedAt: number };

export type PolicyFetchDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

export const policyRenderUrl = (policyKey: string, origin: string) =>
  `https://embed.termageddon.com/api/render/${encodeURIComponent(policyKey)}?origin=${encodeURIComponent(origin)}`;

/** The page's public URL from the proxied request, as the browser would report it to Termageddon. */
export function pageOrigin(headers: Headers, path: string): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : "https";
  return `${proto}://${host.toLowerCase()}${path}`;
}

export function createPolicyCache() {
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<string | null>>();

  async function load(policyKey: string, origin: string, deps: PolicyFetchDeps): Promise<string> {
    const fetchImpl = deps.fetch ?? fetch;
    const response = await fetchImpl(policyRenderUrl(policyKey, origin), {
      signal: AbortSignal.timeout(deps.timeoutMs ?? POLICY_TIMEOUT_MS),
      headers: { accept: "text/html" },
    });
    if (!response.ok) throw new Error(`Termageddon answered ${response.status}`);
    const html = await response.text();
    // An empty or tiny answer is not a policy; let the browser fallback try instead.
    if (html.trim().length < 100) throw new Error("Termageddon returned no policy");
    return html;
  }

  return async function policyHtml(
    policyKey: string,
    origin: string,
    deps: PolicyFetchDeps = {},
  ): Promise<string | null> {
    const now = deps.now ?? Date.now;
    const cacheKey = `${policyKey} ${origin}`;
    const cached = entries.get(cacheKey);
    if (cached && now() - cached.fetchedAt < POLICY_FRESH_MS) return cached.html;

    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = load(policyKey, origin, deps)
        .then((html) => {
          entries.delete(cacheKey);
          entries.set(cacheKey, { html, fetchedAt: now() });
          while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
          return html;
        })
        .catch(() => null)
        .finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, pending);
    }
    const html = await pending;
    if (html !== null) return html;
    return cached && now() - cached.fetchedAt < POLICY_STALE_MS ? cached.html : null;
  };
}

/** The process-wide cache the legal pages use. */
export const policyHtml = createPolicyCache();
