import test from "node:test";
import assert from "node:assert/strict";
import {
  accountHeaders,
  accountSignInPath,
  accountSignOutPath,
  afterSignIn,
  audienceFor,
  audiences,
  communityRoles,
  contributorPath,
  decideAccess,
  isCommunityRole,
  safeAccountReturn,
  shouldRecheckOnReturn,
  signInPath,
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

test("editors get their own sign-in page; public links retain action context", () => {
  assert.equal(
    accountSignInPath("/contribute?game=aircraft-identifier&view=mine"),
    "/sign-in?as=photographer&return_to=%2Fcontribute%3Fgame%3Daircraft-identifier%26view%3Dmine",
  );
  assert.equal(accountSignInPath("/contribute"), "/sign-in?as=photographer");
  assert.equal(accountSignInPath("/admin"), "/admin/sign-in");
  assert.equal(
    accountSignInPath("/admin?tab=review"),
    "/admin/sign-in?return_to=%2Fadmin%3Ftab%3Dreview",
  );
  assert.equal(accountSignInPath("/play"), "/sign-in?as=player");
  assert.equal(
    accountSignInPath("/account"),
    "/sign-in?as=player&return_to=%2Faccount",
  );
  assert.equal(accountSignInPath("//evil.example"), "/sign-in?as=player&return_to=%2F");
  assert.equal(signInPath("photographer"), "/sign-in?as=photographer");
  assert.equal(signInPath("player", "/sign-in?as=player"), "/sign-in?as=player&return_to=%2F");
  assert.equal(accountSignInPath("/"), "/sign-in?as=player&return_to=%2F");
  assert.equal(accountSignOutPath(), "/sign-out");
});

test("legacy public audience hints cannot select admin", () => {
  assert.deepEqual([...communityRoles], ["photographer", "player"]);
  assert.equal(isCommunityRole("player"), true);
  assert.equal(isCommunityRole("admin"), false);
  assert.equal(isCommunityRole(undefined), false);
});

test("every audience sign-in page is a reserved return destination", () => {
  for (const { signIn } of Object.values(audiences))
    assert.equal(safeAccountReturn(`${signIn}?return_to=/admin`), "/");
});

test("areas belong to one audience; everything else is the player's", () => {
  assert.equal(audienceFor("/admin"), "admin");
  assert.equal(audienceFor("/admin/sign-in"), "admin");
  assert.equal(audienceFor("/administrator"), "player");
  assert.equal(audienceFor("/contribute?view=mine"), "photographer");
  assert.equal(audienceFor("/play"), "player");
  assert.equal(audienceFor("/account"), "player");
  assert.equal(audienceFor("/"), "player");
});

const signedIn = (overrides = {}) => ({
  signedIn: true,
  displayName: "Pilot",
  emailVerified: true,
  staff: false,
  demo: false,
  ...overrides,
});

test("access decisions per audience", () => {
  const out = { signedIn: false };
  assert.deepEqual(decideAccess("admin", out), { kind: "sign-in" });
  assert.deepEqual(decideAccess("player", out), { kind: "sign-in" });
  assert.deepEqual(decideAccess("photographer", out), { kind: "guest" });

  assert.deepEqual(decideAccess("admin", signedIn()), { kind: "denied" });
  assert.deepEqual(decideAccess("admin", signedIn({ staff: true })), {
    kind: "granted",
    readOnly: false,
  });
  assert.deepEqual(decideAccess("admin", signedIn({ demo: true })), {
    kind: "granted",
    readOnly: true,
  });

  assert.deepEqual(decideAccess("photographer", signedIn()), {
    kind: "granted",
    readOnly: false,
  });
  assert.deepEqual(decideAccess("photographer", signedIn({ demo: true })), {
    kind: "elsewhere",
    to: "/admin",
  });
  assert.deepEqual(decideAccess("player", signedIn()), {
    kind: "granted",
    readOnly: false,
  });
});

test("after sign-in lands on the return path, the area home, or email verification", () => {
  assert.equal(
    afterSignIn({ audience: "admin", returnTo: "/admin?tab=x", principal: signedIn({ staff: true }) }),
    "/admin?tab=x",
  );
  assert.equal(
    afterSignIn({ audience: "player", returnTo: "/", principal: signedIn() }),
    "/",
  );
  assert.equal(
    afterSignIn({ audience: "photographer", returnTo: "https://evil.example", principal: signedIn() }),
    "/",
  );
  assert.equal(
    afterSignIn({ audience: "player", returnTo: "/play", principal: signedIn({ demo: true }) }),
    "/admin",
  );
  assert.equal(
    afterSignIn({ audience: "photographer", returnTo: "/contribute", principal: signedIn({ emailVerified: false }) }),
    "/account?verify_email=1&return_to=%2Fcontribute",
  );
  assert.equal(
    afterSignIn({ audience: "player", principal: signedIn(), signup: true }),
    "/account?verify_email=1&return_to=%2Fplay",
  );
});

test("direct public sign-in and verification retain the homepage destination", () => {
  assert.equal(
    afterSignIn({ audience: "player", returnTo: "/", principal: signedIn(), signup: true }),
    "/account?verify_email=1&return_to=%2F",
  );
  assert.equal(
    afterSignIn({ audience: "player", returnTo: "/games#military", principal: signedIn() }),
    "/games#military",
  );
  assert.equal(
    afterSignIn({ audience: "player", returnTo: "/sign-in", principal: signedIn() }),
    "/",
  );
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

test("returning to the tab re-checks the account once per window, and always after a restore", () => {
  const now = 1_000_000;
  assert.equal(shouldRecheckOnReturn({ now, lastConfirmed: null, checking: false }), true);
  assert.equal(shouldRecheckOnReturn({ now, lastConfirmed: now - 59_999, checking: false }), false);
  assert.equal(shouldRecheckOnReturn({ now, lastConfirmed: now - 60_000, checking: false }), true);
  assert.equal(
    shouldRecheckOnReturn({ now, lastConfirmed: now - 1_000, checking: false, restored: true }),
    true,
  );
  // Focus and visibilitychange arrive together; the second finds the first still running.
  assert.equal(shouldRecheckOnReturn({ now, lastConfirmed: null, checking: true }), false);
  assert.equal(
    shouldRecheckOnReturn({ now, lastConfirmed: null, checking: true, restored: true }),
    false,
  );
});
