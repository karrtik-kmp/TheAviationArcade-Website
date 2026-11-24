"use client";
import { useEffect, useState } from "react";

/**
 * A Termageddon policy (client's embeds, 2026-11-24). Termageddon's embed script only runs on the
 * window `load` event, which has already fired when React mounts this page, so we make the same request
 * it would make: the policy's render URL with the page as `origin`, whose HTML (styles scoped to the
 * element with the policy key as id) goes into that element. The policy link is the fallback.
 */
export function PolicyEmbed({ policyKey, label }: { policyKey: string; label: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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
  }, [policyKey]);

  const policyUrl = `https://policies.termageddon.com/api/policy/${policyKey}`;
  if (html !== null) {
    return (
      <div
        id={policyKey}
        className="policy_embed_div"
        aria-busy="false"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div id={policyKey} className="policy_embed_div" aria-live="polite" aria-busy={!failed}>
      {failed
        ? `The ${label.toLowerCase()} could not be loaded here. `
        : `Please wait while the ${label.toLowerCase()} is loaded. If it does not load, `}
      <a rel="nofollow noopener" href={policyUrl} target="_blank">
        view the {label.toLowerCase()} on Termageddon
      </a>
      .
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
