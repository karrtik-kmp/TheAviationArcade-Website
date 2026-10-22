import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { verifyFirebaseToken } from "../lib/firebase-verifier.ts";

const projectId = "airplane-games-test";
const issuer = `https://securetoken.google.com/${projectId}`;
const now = Math.floor(Date.now() / 1000);
const claims = (overrides = {}) => ({
  sub: "uid-123",
  email: "pilot@example.com",
  email_verified: true,
  name: " Test Pilot ",
  firebase: { sign_in_provider: "password" },
  ...overrides,
});

const { privateKey, publicKey } = await generateKeyPair("RS256");
const resolver = async () => publicKey;

async function sign(overrides = {}, options = {}) {
  const payload = {
    ...claims(overrides),
    auth_time: options.authTime ?? now - 60,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "unit-test-key" })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? projectId)
    .setIssuedAt(options.issuedAt ?? now - 5)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(options.privateKey ?? privateKey);
}

test("verifies Firebase identity claims and namespaces the user id", async () => {
  const token = await sign();
  const identity = await verifyFirebaseToken(
    token,
    { projectId, emulator: false },
    resolver,
  );
  assert.deepEqual(identity, {
    userId: `firebase:${projectId}:uid-123`,
    email: "pilot@example.com",
    fullName: "Test Pilot",
    emailVerified: true,
    expiresAt: now + 300,
    authTime: now - 60,
  });
});

test("does not make a network request when tests provide a key resolver", async () => {
  const token = await sign({
    firebase: { sign_in_provider: "google.com" },
    name: "",
  });
  const identity = await verifyFirebaseToken(
    token,
    { projectId, emulator: false },
    resolver,
  );
  assert.equal(identity.fullName, null);
  assert.equal(identity.emailVerified, true);
});

test("rejects a token with a bad signature", async () => {
  const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
  const token = await sign({}, { privateKey: otherPrivateKey });
  await assert.rejects(
    verifyFirebaseToken(token, { projectId, emulator: false }, resolver),
  );
});

test("rejects the wrong audience and issuer", async () => {
  await assert.rejects(
    verifyFirebaseToken(
      await sign({}, { audience: "another-project" }),
      { projectId, emulator: false },
      resolver,
    ),
  );
  await assert.rejects(
    verifyFirebaseToken(
      await sign({}, { issuer: "https://attacker.example" }),
      { projectId, emulator: false },
      resolver,
    ),
  );
});

test("rejects expired, future-issued, and future-authenticated tokens", async () => {
  await assert.rejects(
    verifyFirebaseToken(
      await sign({}, { expiresAt: now - 1 }),
      { projectId, emulator: false },
      resolver,
    ),
  );
  await assert.rejects(
    verifyFirebaseToken(
      await sign({}, { issuedAt: now + 60 }),
      { projectId, emulator: false },
      resolver,
    ),
  );
  await assert.rejects(
    verifyFirebaseToken(
      await sign({}, { authTime: now + 60 }),
      { projectId, emulator: false },
      resolver,
    ),
  );
});

test("rejects malformed subjects and email addresses", async () => {
  await assert.rejects(
    verifyFirebaseToken(
      await sign({ sub: "" }),
      { projectId, emulator: false },
      resolver,
    ),
  );
  await assert.rejects(
    verifyFirebaseToken(
      await sign({ sub: "u".repeat(129) }),
      { projectId, emulator: false },
      resolver,
    ),
  );
  await assert.rejects(
    verifyFirebaseToken(
      await sign({ email: "not-an-email" }),
      { projectId, emulator: false },
      resolver,
    ),
  );
});

test("accepts only password and Google as Firebase sign-in providers", async () => {
  for (const provider of ["phone", "custom", "facebook.com", ""]) {
    const token = await sign({ firebase: { sign_in_provider: provider } });
    await assert.rejects(
      verifyFirebaseToken(token, { projectId, emulator: false }, resolver),
    );
  }
});

test("rejects unsigned emulator tokens unless the development build and emulator option both allow them", async () => {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    ...claims(),
    aud: projectId,
    iss: issuer,
    iat: now - 5,
    exp: now + 300,
    auth_time: now - 60,
  })}.`;
  await assert.rejects(
    verifyFirebaseToken(unsigned, { projectId, emulator: true }),
  );
  await assert.rejects(
    verifyFirebaseToken(unsigned, { projectId, emulator: false }),
  );
});
