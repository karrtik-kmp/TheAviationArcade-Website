/**
 * FAQ answer text → paragraphs, lines and links. Shared with the Admin (copied byte-identical, with
 * tests/faq-answer.test.mjs), so the Admin preview shows exactly what the website shows.
 *
 * Answers are plain text (docs/briefs/faq-cms-plan.md): a blank line starts a paragraph, a single newline is a
 * line break, and only two kinds of link are recognised:
 * - `https://` URLs (checked with `URL`), with trailing sentence punctuation left out of the link;
 * - site paths such as `/privacy` or `/faq#account`: lowercase letters, digits, `-`, `/` and `#`, never `//`.
 * Everything else stays text. No HTML or Markdown is interpreted, and nothing here produces markup.
 */

export type FaqInline =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string; external: boolean };

/** A paragraph is a list of lines; a line is a list of inline pieces. */
export type FaqParagraph = FaqInline[][];

// A candidate starts at the beginning of the text or after whitespace or "(".
const CANDIDATE = /(^|[\s(])(https:\/\/[^\s<>"]+|\/[a-z0-9][a-z0-9\-/#]*)/g;
const SITE_PATH = /^\/[a-z0-9][a-z0-9\-/#]*$/;
const count = (text: string, char: string) => text.split(char).length - 1;

/**
 * Drops sentence punctuation after a URL. A ")" stays only while it closes a "(" inside the URL
 * (e.g. https://en.wikipedia.org/wiki/Boeing_747_(disambiguation)).
 */
function trimTrailing(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url[url.length - 1];
    if (".,;:!?'\"]".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && count(url, ")") > count(url, "(")) url = url.slice(0, -1);
    else return url;
  }
}

function safeHttps(text: string): string | null {
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname === "" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function inlines(line: string): FaqInline[] {
  const out: FaqInline[] = [];
  let at = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.text += text;
    else out.push({ kind: "text", text });
  };
  for (const match of line.matchAll(CANDIDATE)) {
    const start = (match.index ?? 0) + match[1].length;
    const raw = match[2];
    let link: FaqInline | null = null;
    let used = raw;
    if (raw.startsWith("https://")) {
      used = trimTrailing(raw);
      const href = safeHttps(used);
      if (href) link = { kind: "link", text: used, href, external: true };
    } else if (!raw.includes("//")) {
      used = raw.replace(/#+$/, "");
      if (SITE_PATH.test(used)) link = { kind: "link", text: used, href: used, external: false };
    }
    if (!link) continue;
    pushText(line.slice(at, start));
    out.push(link);
    at = start + used.length;
  }
  pushText(line.slice(at));
  return out;
}

/** Parses an answer. Line endings are normalised; empty paragraphs are dropped. */
export function parseFaqAnswer(answer: string): FaqParagraph[] {
  return answer
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => block.split("\n").map((line) => inlines(line)));
}

/** The answer as plain text with paragraphs joined by a blank line (for search and JSON-LD). */
export function faqAnswerText(answer: string): string {
  return parseFaqAnswer(answer)
    .map((paragraph) => paragraph.map((line) => line.map((piece) => piece.text).join("")).join("\n"))
    .join("\n\n");
}
