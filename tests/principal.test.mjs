import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthUnavailable,
  accountSessionKey,
  resolvePrincipal,
} from "../lib/request/principal.ts";
import { firebaseTokenVerifier } from "../lib/request/firebase-token-verifier.ts";

const project = "demo-airplane-games";
const identity = (uid, email, emailVerified = true) => ({
  userId: `firebase:${project}:${uid}`,
  email,
  fullName: uid === "editor" ? "  Editor Name  " : null,
  emailVerified,
  expiresAt: 9999999999,
  authTime: 1,
});
const tokens = {
  editor: identity("editor", "Editor@Example.com"),
  unverified: identity("unverified", "editor@example.com", false),
  member: identity("member", "member@example.com"),
  demo: identity("demo-uid", "editor@example.com"),
};
function fakeVerifier() {
  const verifier = {
    calls: 0,
    async verify(token) {
      verifier.calls += 1;
      if (token === "down") throw new AuthUnavailable();
      return tokens[token] ?? null;
    },
  };
  return verifier;
}
const deps = (verifier) => ({
  verifier,
  cookieName: "aa_session",
  staffEmails: ["editor@example.com"],
  projectId: project,
  demoUid: "demo-uid",
});
const headers = (cookie) => new Headers(cookie ? { cookie } : {});

test("a session cookie is verified exactly once", async () => {
  const verifier = fakeVerifier();
  const principal = await resolvePrincipal(headers("theme=dark; aa_session=editor"), deps(verifier));
  assert.equal(verifier.calls, 1);
  assert.equal(principal.kind, "member");
  assert.equal(principal.userId, `firebase:${project}:editor`);
  assert.equal(principal.displayName, "Editor Name");
  assert.equal(principal.sessionKey, await accountSessionKey(principal.userId));
});

test("staff needs a verified allowlisted email and is never the demo account", async () => {
  const verifier = fakeVerifier();
  const as = (token) => resolvePrincipal(headers(`aa_session=${token}`), deps(verifier));
  assert.equal((await as("editor")).staff, true, "the allowlist match ignores case");
  assert.equal((await as("unverified")).staff, false);
  assert.equal((await as("member")).staff, false);
  const demo = await as("demo");
  assert.deepEqual([demo.demo, demo.staff], [true, false], "the demo UID never gains staff");
});

test("missing, duplicate and invalid cookies give a guest", async () => {
  const verifier = fakeVerifier();
  assert.deepEqual(await resolvePrincipal(headers(), deps(verifier)), { kind: "guest" });
  assert.deepEqual(
    await resolvePrincipal(headers("aa_session=editor; aa_session=member"), deps(verifier)),
    { kind: "guest" },
  );
  assert.deepEqual(await resolvePrincipal(headers("aa_session=forged"), deps(verifier)), { kind: "guest" });
  assert.equal(verifier.calls, 1, "duplicates are refused before verification");
  assert.deepEqual(await resolvePrincipal(headers("aa_session=editor"), { ...deps(null) }), { kind: "guest" });
});

test("a malformed JWT is a guest without reaching Google", async () => {
  const verifier = firebaseTokenVerifier({ projectId: project, emulator: false });
  assert.equal(await verifier.verify("not-a-jwt"), null);
  assert.deepEqual(await resolvePrincipal(headers("aa_session=a.b.c"), deps(verifier)), { kind: "guest" });
});

test("an unreachable key service is reported, not treated as a guest", async () => {
  await assert.rejects(resolvePrincipal(headers("aa_session=down"), deps(fakeVerifier())), AuthUnavailable);
});

test("the bearer token never serializes", async () => {
  const principal = await resolvePrincipal(headers("aa_session=editor"), deps(fakeVerifier()));
  assert.equal(principal.bearer.reveal(), "editor");
  assert.ok(!JSON.stringify(principal).includes("\"editor\""));
  assert.equal(`${principal.bearer}`, "[redacted]");
});
