"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A Termageddon policy (client's embeds, 2026-11-24). Termageddon's embed script only runs on the
 * window `load` event, which has already fired when React mounts this page, so we make the same request
 * it would make: the policy's render URL with the page as `origin`, whose HTML (styles scoped to the
 * element with the policy key as id) goes into that element. The policy link is the fallback.
 */
export function PolicyEmbed({ policyKey, label }: { policyKey: string; label: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setHtml(null);
    setFailed(false);
    fetch(
      `https://embed.termageddon.com/api/render/${policyKey}?origin=${encodeURIComponent(window.location.href)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`Policy request failed: ${response.status}`);
        return response.text();
      })
      .then(setHtml)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [policyKey, attempt]);

  useEffect(() => {
    if (html === null) return;
    // The policy arrives after the browser's own jump to a #section link, so make that jump once it is in.
    if (window.location.hash) {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    } else if (attempt > 0) {
      // "Try again" is gone once the policy loads; keep keyboard focus at the policy instead of the page top.
      container.current?.focus({ preventScroll: true });
    }
  }, [html, attempt]);

  const policyUrl = `https://policies.termageddon.com/api/policy/${policyKey}`;
  if (html !== null) {
    return (
      <div
        ref={container}
        id={policyKey}
        className="policy_embed_div"
        tabIndex={-1}
        aria-busy="false"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div
      ref={container}
      id={policyKey}
      className={failed ? "policy_embed_div" : "policy_embed_div policy-loading"}
      aria-live="polite"
      aria-busy={!failed}
    >
      <p>
        {failed
          ? `The ${label.toLowerCase()} could not be loaded here. `
          : `Please wait while the ${label.toLowerCase()} is loaded. If it does not load, `}
        <a rel="nofollow noopener" href={policyUrl} target="_blank">
          {failed ? "View" : "view"} the {label.toLowerCase()} on Termageddon
        </a>
        .
      </p>
      {failed && (
        <button type="button" className="btn secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      )}
      {!failed && (
        <div className="policy-skeleton" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Reopens the Usercentrics consent settings (loaded in the root layout). */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? "link-button"}
      onClick={() =>
        (window as unknown as { UC_UI?: { showSecondLayer?: () => void } }).UC_UI?.showSecondLayer?.()
      }
    >
      Cookie settings
    </button>
  );
}
