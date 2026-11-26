"use client";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { FaqAnswer } from "@/components/FaqAnswer";
import { faqAnswerText } from "@/lib/faq-answer";
import type { FaqCategory } from "@/lib/faq";
import "./faq.css";

const noSubscribe = () => () => {};
const normalise = (text: string) => text.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");

/** Opens the entry named by the URL fragment (`#faq-<id>`) and brings it into view. */
function openTarget() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id.startsWith("faq-")) return;
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
    target.scrollIntoView({ block: "start" });
    target.querySelector("summary")?.focus({ preventScroll: true });
  }
}

/**
 * The FAQ as category sections of <details> entries. The server renders every entry, so the page works
 * without JavaScript; the search box appears only after hydration, filters question and answer text, hides
 * categories with no match and announces the count.
 */
export function FaqList({ categories }: { categories: FaqCategory[] }) {
  const searchId = useId();
  // True only in the browser after hydration: the server and the no-JS page render no search box.
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [query, setQuery] = useState("");
  const [announced, setAnnounced] = useState("");

  const index = useMemo(
    () =>
      categories.map((category) => ({
        category,
        entries: category.entries.map((entry) => ({
          entry,
          haystack: normalise(`${category.title}\n${entry.question}\n${faqAnswerText(entry.answer)}`),
        })),
      })),
    [categories],
  );
  const total = index.reduce((sum, c) => sum + c.entries.length, 0);
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  const matches = (haystack: string) => terms.every((term) => haystack.includes(term));
  const shown = terms.length ? index.reduce((sum, c) => sum + c.entries.filter((e) => matches(e.haystack)).length, 0) : total;

  useEffect(() => {
    openTarget();
    // A link to one answer clears any search first, so the answer isn't hidden by the filter.
    const onHashChange = () => {
      setQuery("");
      requestAnimationFrame(openTarget);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Announce the result count once typing pauses, not on every key.
  useEffect(() => {
    const message = !terms.length ? "" : shown ? `${shown} of ${total} answers` : "No answers match";
    const timer = setTimeout(() => setAnnounced(message), terms.length ? 400 : 0);
    return () => clearTimeout(timer);
  }, [shown, total, terms.length]);

  return (
    <div className="faq">
      {ready && (
        <div className="faq-search" role="search">
          <label htmlFor={searchId}>Search the FAQ</label>
          <div className="faq-search-row">
            <input
              id={searchId}
              type="search"
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" className="btn secondary" onClick={() => setQuery("")}>
                Clear
              </button>
            )}
          </div>
          <p className="faq-count" aria-hidden="true">
            {terms.length ? (shown ? `${shown} of ${total} answers` : "") : ""}
          </p>
          <p className="faq-sr" role="status" aria-live="polite">
            {announced}
          </p>
        </div>
      )}
      {terms.length > 0 && shown === 0 && (
        <p className="faq-empty">
          No answers match “{query.trim()}”.{" "}
          <button type="button" className="text-link faq-clear" onClick={() => setQuery("")}>
            Clear the search
          </button>
        </p>
      )}
      {index.map(({ category, entries }) => {
        const visible = terms.length ? entries.filter((e) => matches(e.haystack)) : entries;
        return (
          <section key={category.id} className="faq-category" hidden={visible.length === 0}>
            <h2 id={`faq-category-${category.id}`}>{category.title}</h2>
            {entries.map(({ entry, haystack }) => (
              <details
                key={entry.id}
                id={`faq-${entry.id}`}
                className="faq-entry"
                hidden={terms.length > 0 && !matches(haystack)}
              >
                <summary>{entry.question}</summary>
                <div className="faq-answer">
                  <FaqAnswer answer={entry.answer} />
                </div>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
