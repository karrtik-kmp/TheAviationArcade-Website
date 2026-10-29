/** The production TokenVerifier: Firebase ID tokens checked against Google's keys (or the local emulator). */
import { decodeJwt, decodeProtectedHeader } from "jose";
import { verifyFirebaseToken, type FirebaseTokenOptions } from "../firebase-verifier.ts";
import { AuthUnavailable, type TokenVerifier } from "./principal.ts";

export function firebaseTokenVerifier(options: FirebaseTokenOptions): TokenVerifier {
  return {
    async verify(token) {
      try {
        decodeProtectedHeader(token);
        decodeJwt(token);
      } catch {
        return null;
      }
      try {
        return await verifyFirebaseToken(token, options);
      } catch (error) {
        if (
          error instanceof TypeError ||
          (error && typeof error === "object" && "code" in error && error.code === "ERR_JWKS_TIMEOUT")
        )
          throw new AuthUnavailable();
        return null;
      }
    },
  };
}
