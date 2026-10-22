import test from "node:test";
import assert from "node:assert/strict";
import {
  accountHeaders,
  accountSignInPath,
  accountSignOutPath,
  contributorPath,
  safeAccountReturn,
} from "../lib/account.ts";

test("account return paths keep same-site paths, queries, and fragments", () => {
  assert.equal(
    safeAccountReturn(
      "/contribute?game=aircraft-identifier&view=mine#submissions",
    ),
    "/contribute?game=aircraft-identifier&view=mine#submissions",
  );
  assert.equal(safeAccountReturn("/admin?tab=review"), "/admin?tab=review");
  assert.equal(safeAccountReturn("/"), "/");
});

test("account return paths reject external, ambiguous, control, and auth destinations", () => {
  for (const value of [
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/admin\\@evil.example/path",
    "/admin\nhttps://evil.example",
    "/admin\u0000",
    "/signin-with-chatgpt?return_to=/admin",
    "/signout-with-chatgpt?return_to=/",
    "/callback?code=secret",
    "/sign-in?return_to=/admin",
    "/sign-out",
  ]) {
    assert.equal(safeAccountReturn(value), "/", JSON.stringify(value));
  }
  assert.equal(safeAccountReturn(undefined), "/");
  assert.equal(safeAccountReturn("admin"), "/");
});

test("sign-in and sign-out paths use safe local return destinations", () => {
  assert.equal(
    accountSignInPath("/contribute?game=aircraft-identifier&view=mine"),
    "/sign-in?return_to=%2Fcontribute%3Fgame%3Daircraft-identifier%26view%3Dmine",
  );
  assert.equal(accountSignInPath("//evil.example"), "/sign-in?return_to=%2F");
  assert.equal(accountSignOutPath(), "/sign-out");
});

test("contributor paths preserve only valid category, game, and mine filters", () => {
  assert.equal(
    contributorPath("aircraft", "aircraft-identifier", "mine"),
    "/contribute?category=aircraft&game=aircraft-identifier&view=mine",
  );
  assert.equal(
    contributorPath(undefined, "tail-identifier", "mine"),
    "/contribute?game=tail-identifier&view=mine",
  );
  assert.equal(
    contributorPath("../admin", "//evil.example", "other"),
    "/contribute",
  );
});

test("account request headers carry only a present session key", () => {
  assert.deepEqual(accountHeaders("opaque-session-key"), {
    "X-Account-Session": "opaque-session-key",
  });
  assert.deepEqual(accountHeaders(null), {});
  assert.deepEqual(accountHeaders(undefined), {});
});
