/** The production ProgressSource: `GET /v1/me/progress` on the game backend, as the member. */
import { BackendError, BackendNotConnected, type BackendClient } from "../request/backend.ts";
import type { Bearer } from "../request/principal.ts";
import { progressEnvelopeSchema, type ProgressSource, type ProgressState } from "./source.ts";

export function httpProgressSource(client: (bearer: Bearer) => BackendClient): ProgressSource {
  return {
    async read(member): Promise<ProgressState> {
      try {
        const parsed = progressEnvelopeSchema.safeParse(await client(member.bearer).getJson("/v1/me/progress"));
        // An answer off the contract is shown as unavailable, never as made-up progress.
        return parsed.success ? { kind: "progress", progress: parsed.data.progress } : { kind: "unavailable" };
      } catch (error) {
        if (error instanceof BackendNotConnected) return { kind: "not-connected" };
        if (error instanceof BackendError) {
          if (error.status === 404 && error.code === "player_not_found") return { kind: "no-player" };
          if (error.status === 401) return { kind: "signed-out" };
          return { kind: "unavailable", ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}) };
        }
        throw error;
      }
    },
  };
}
