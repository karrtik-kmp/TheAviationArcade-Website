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
const active = (role, state = "active") => ({
  role,
  state,
  revision: 1,
  requestedAt: "2026-11-01T00:00:00.000Z",
  decidedAt: "2026-11-02T00:00:00.000Z",
});
/** Backend role rows per token. The demo token holds admin here to prove it is never asked for. */
const backendRoles = {
  editor: [active("player"), active("admin"), active("photographer")],
  unverified: [active("admin"), active("photographer")],
  member: [active("player"), active("photographer", "pending")],
  demo: [active("admin"), active("photographer")],
};
function fakeRoles(snapshot) {
  const roles = async (bearer) => {
    roles.asked.push(bearer.reveal());
    return snapshot ?? { status: "ok", roles: backendRoles[bearer.reveal()] ?? [] };
  };
  roles.asked = [];
  return roles;
}
const deps = (verifier, roles = fakeRoles()) => ({
  verifier,
  cookieName: "aa_session",
  roles,
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

test("staff and photographer need an active backend role on a verified email, never the demo account", async () => {
  const verifier = fakeVerifier();
  const roles = fakeRoles();
  const as = (token) => resolvePrincipal(headers(`aa_session=${token}`), deps(verifier, roles));
  const editor = await as("editor");
  assert.deepEqual([editor.staff, editor.photographer], [true, true]);
  const unverified = await as("unverified");
  assert.deepEqual([unverified.staff, unverified.photographer], [false, false], "an unverified email holds nothing");
  const member = await as("member");
  assert.deepEqual([member.staff, member.photographer], [false, false], "a pending row grants nothing");
  const demo = await as("demo");
  assert.deepEqual([demo.demo, demo.staff, demo.photographer], [true, false, false], "the demo UID never gains a role");
  assert.deepEqual(roles.asked, ["editor", "unverified", "member"], "roles are read with the member's own token, never for demo");
});

test("unreadable roles give no role, and say so", async () => {
  for (const status of ["unavailable", "not-connected"]) {
    const principal = await resolvePrincipal(
      headers("aa_session=editor"),
      deps(fakeVerifier(), fakeRoles({ status })),
    );
    assert.deepEqual([principal.staff, principal.photographer, principal.roles.status], [false, false, status]);
  }
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
