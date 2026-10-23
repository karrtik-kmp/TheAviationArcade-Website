import test from "node:test";
import assert from "node:assert/strict";
import {
  accountHeaders,
  accountSignInPath,
  accountSignOutPath,
  afterSignIn,
  audienceFor,
  audiences,
  contributorPath,
  decideAccess,
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

test("sign-in paths go to the sign-in page of the area being returned to", () => {
  assert.equal(
    accountSignInPath("/contribute?game=aircraft-identifier&view=mine"),
    "/contribute/sign-in?return_to=%2Fcontribute%3Fgame%3Daircraft-identifier%26view%3Dmine",
  );
  assert.equal(accountSignInPath("/admin"), "/admin/sign-in");
  assert.equal(
    accountSignInPath("/admin?tab=review"),
    "/admin/sign-in?return_to=%2Fadmin%3Ftab%3Dreview",
  );
  assert.equal(accountSignInPath("/play"), "/play/sign-in");
  assert.equal(
    accountSignInPath("/account"),
    "/play/sign-in?return_to=%2Faccount",
  );
  assert.equal(accountSignInPath("//evil.example"), "/play/sign-in?return_to=%2F");
  assert.equal(accountSignOutPath(), "/sign-out");
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
    "/play",
  );
  assert.equal(
    afterSignIn({ audience: "photographer", returnTo: "https://evil.example", principal: signedIn() }),
    "/contribute",
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
