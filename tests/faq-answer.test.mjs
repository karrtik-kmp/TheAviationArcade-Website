// Shared with the Admin: copy this file and lib/faq-answer.ts byte-identical so both repos render answers alike.
import test from "node:test";
import assert from "node:assert/strict";
import { faqAnswerText, parseFaqAnswer } from "../lib/faq-answer.ts";

const text = (t) => ({ kind: "text", text: t });
const ext = (t, href = t) => ({ kind: "link", text: t, href, external: true });
const site = (t) => ({ kind: "link", text: t, href: t, external: false });
const one = (answer) => parseFaqAnswer(answer)[0][0];

test("paragraphs split on blank lines; single newlines are line breaks", () => {
  assert.deepEqual(parseFaqAnswer("First line\nsecond line\n\n\nNext paragraph"), [
    [[text("First line")], [text("second line")]],
    [[text("Next paragraph")]],
  ]);
});

test("CRLF and CR line endings are normalised; blank paragraphs and outer space dropped", () => {
  assert.deepEqual(parseFaqAnswer("  A\r\nB\r\n \r\n\rC  \n\n   \n"), [[[text("A")], [text("B")]], [[text("C")]]]);
  assert.deepEqual(parseFaqAnswer(""), []);
  assert.deepEqual(parseFaqAnswer(" \n\n \n"), []);
});

test("https URLs become external links; trailing punctuation stays text", () => {
  assert.deepEqual(one("See https://example.com/help."), [text("See "), ext("https://example.com/help"), text(".")]);
  assert.deepEqual(one("(https://example.com/a?b=1&c=2), then"), [
    text("("),
    ext("https://example.com/a?b=1&c=2"),
    text("), then"),
  ]);
  assert.deepEqual(one("Really? https://example.com!"), [
    text("Really? "),
    ext("https://example.com", "https://example.com/"),
    text("!"),
  ]);
});

test("a ')' that closes a '(' inside the URL stays in the link", () => {
  const url = "https://en.wikipedia.org/wiki/Boeing_747_(disambiguation)";
  assert.deepEqual(one(`Read ${url}.`), [text("Read "), ext(url), text(".")]);
});

test("site paths become site links", () => {
  assert.deepEqual(one("Read /privacy and /faq#account-help."), [
    text("Read "),
    site("/privacy"),
    text(" and "),
    site("/faq#account-help"),
    text("."),
  ]);
  assert.deepEqual(one("(/games/airport-spotter)"), [text("("), site("/games/airport-spotter"), text(")")]);
  assert.deepEqual(one("/contribute"), [site("/contribute")]);
});

test("unsafe or unsupported links stay plain text", () => {
  for (const answer of [
    "javascript:alert(1)",
    "Click javascript://example.com/%0Aalert(1)",
    "Go to //evil.example/path",
    "http://example.com is not linked",
    "Use HTTPS://EXAMPLE.COM? no",
    "ftp://example.com",
    "data:text/html,<script>alert(1)</script>",
    "<a href=\"https\">x</a> and <b>bold</b>",
    "**not markdown** [x](https)",
    "yes / no and/or a/b",
    "/Privacy with capitals",
    "https://",
    "https://user:pass@example.com/",
  ]) {
    const pieces = parseFaqAnswer(answer).flat(2);
    assert.ok(
      pieces.every((p) => p.kind === "text"),
      `expected only text for ${JSON.stringify(answer)}, got ${JSON.stringify(pieces)}`,
    );
    assert.equal(faqAnswerText(answer), answer.trim());
  }
});

test("a site path never starts with //, even after a site link", () => {
  assert.deepEqual(one("/faq//evil.example"), [text("/faq//evil.example")]);
});

test("words glued to a path or URL are not linked", () => {
  assert.deepEqual(one("and/privacy"), [text("and/privacy")]);
  assert.deepEqual(one("xhttps://example.com"), [text("xhttps://example.com")]);
});

test("a trailing '#' is left out of a site link", () => {
  assert.deepEqual(one("See /faq#"), [text("See "), site("/faq"), text("#")]);
});

test("faqAnswerText keeps paragraphs and line breaks for search and JSON-LD", () => {
  assert.equal(faqAnswerText("A\r\nB https://example.com.\n\n\nC /privacy"), "A\nB https://example.com.\n\nC /privacy");
});
