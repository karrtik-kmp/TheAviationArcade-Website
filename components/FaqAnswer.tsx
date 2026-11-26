import { Fragment } from "react";
import { SiteLink } from "@/components/SiteLink";
import { parseFaqAnswer } from "@/lib/faq-answer";

/**
 * Renders a plain-text FAQ answer as paragraphs, line breaks and links, built from React text nodes only
 * (no HTML is ever injected). Shared with the Admin preview; keep both copies identical.
 */
export function FaqAnswer({ answer }: { answer: string }) {
  return (
    <>
      {parseFaqAnswer(answer).map((paragraph, p) => (
        <p key={p}>
          {paragraph.map((line, l) => (
            <Fragment key={l}>
              {l > 0 && <br />}
              {line.map((piece, i) =>
                piece.kind === "text" ? (
                  <Fragment key={i}>{piece.text}</Fragment>
                ) : piece.external ? (
                  <a key={i} href={piece.href} rel="noopener noreferrer">
                    {piece.text}
                  </a>
                ) : (
                  <SiteLink key={i} href={piece.href}>
                    {piece.text}
                  </SiteLink>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}
