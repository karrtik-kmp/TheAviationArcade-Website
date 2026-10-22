import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";

const FIREBASE_JWKS = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);
const remoteFirebaseKeys = createRemoteJWKSet(FIREBASE_JWKS);

export type FirebaseTokenIdentity = {
  userId: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
  expiresAt: number;
  authTime: number;
};

export type FirebaseTokenOptions = {
  projectId: string;
  /** Set only from firebaseSettings() after its dev/loopback checks. */
  emulator: boolean;
};

function developmentBuild(): boolean {
  return typeof import.meta.env !== "undefined" && import.meta.env.DEV === true;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalidToken(): never {
  throw new Error("Invalid Firebase ID token.");
}

function validateIdentity(
  claims: JWTPayload,
  projectId: string,
): FirebaseTokenIdentity {
  const now = Math.floor(Date.now() / 1000);
  const subject = claims.sub;
  const email = claims.email;
  const expiresAt = claims.exp;
  const issuedAt = claims.iat;
  const authTime = claims.auth_time;
  const firebase = objectValue(claims.firebase);
  const provider = firebase?.sign_in_provider;

  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 128 ||
    subject.trim() !== subject ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    typeof issuedAt !== "number" ||
    !Number.isFinite(issuedAt) ||
    issuedAt > now ||
    typeof authTime !== "number" ||
    !Number.isFinite(authTime) ||
    authTime > now ||
    (provider !== "password" && provider !== "google.com")
  ) {
    return invalidToken();
  }

  const name = claims.name;
  return {
    userId: `firebase:${projectId}:${subject}`,
    email,
    fullName: typeof name === "string" && name.trim() ? name.trim() : null,
    emailVerified: claims.email_verified === true,
    expiresAt,
    authTime,
  };
}

/**
 * Verify a Firebase ID token with Google's signing keys. The test resolver is
 * intentionally an injection point for local unit tests; production callers
 * should omit it so only the fixed Firebase JWKS can verify tokens.
 *
 * Revocation is not checked: this validates the signed JWT and its bounded
 * expiry only. Firebase ID tokens expire, but password resets or account
 * disablement do not invalidate a token here until that expiry.
 */
export async function verifyFirebaseToken(
  token: string,
  options: FirebaseTokenOptions,
  optionalKeyResolverForTests?: JWTVerifyGetKey,
): Promise<FirebaseTokenIdentity> {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 24_000 ||
    typeof options.projectId !== "string" ||
    !options.projectId.trim()
  ) {
    return invalidToken();
  }

  const expectedIssuer = `https://securetoken.google.com/${options.projectId}`;
  const header = decodeProtectedHeader(token);

  if (header.alg === "none") {
    if (!options.emulator || !developmentBuild()) return invalidToken();
    const claims = decodeJwt(token);
    if (claims.aud !== options.projectId || claims.iss !== expectedIssuer) {
      return invalidToken();
    }
    return validateIdentity(claims, options.projectId);
  }

  if (header.alg !== "RS256") return invalidToken();
  const keyResolver = optionalKeyResolverForTests ?? remoteFirebaseKeys;
  const { payload } = await jwtVerify(token, keyResolver, {
    algorithms: ["RS256"],
    issuer: expectedIssuer,
    audience: options.projectId,
    requiredClaims: ["sub", "iat", "exp", "auth_time"],
    clockTolerance: 0,
  });
  return validateIdentity(payload, options.projectId);
}
