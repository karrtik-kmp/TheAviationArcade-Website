/**
 * ProgressSource: a member's game progress as the backend reports it (`GET /v1/me/progress`,
 * Backend/docs/openapi.yaml 0.4.0). The website shows it and never stores or changes it; players
 * are created only by the app, so the website never calls `PUT /v1/me`. Relative imports only.
 */
import { z } from "zod";
import { militaryRankNames } from "../military.ts";
import type { MemberPrincipal } from "../request/principal.ts";

/** openapi `Rank`, lowest first. */
export const rankIds = ["trainee", "first-officer", "captain", "check-airman", "chief-pilot"] as const;
export type RankId = (typeof rankIds)[number];
/** The five-rank ladder is the same for every game. */
export const rankName = (rank: RankId) => militaryRankNames[rankIds.indexOf(rank)];

const rank = z.enum(rankIds);
const count = z.number().int().min(0);
/** openapi `Progress`, exactly: `additionalProperties: false`, every property required. */
export const progressSchema = z
  .object({
    version: z.number().int().min(1),
    statusPoints: count,
    miles: count,
    hints: count,
    certifiedRank: rank,
    activeRank: rank,
    pleasureCruise: z.boolean(),
    selectableRanks: z.array(rank),
    nextRank: z.object({ rank, statusPoints: count }).strict().nullable(),
    perfectStreak: count,
    firstClassPass: z.boolean(),
  })
  .strict();
export const progressEnvelopeSchema = z.object({ progress: progressSchema }).strict();
export type Progress = z.infer<typeof progressSchema>;

export type ProgressState =
  | { kind: "progress"; progress: Progress; sample?: true }
  /** Signed in, but the app has not created a player for this account yet. */
  | { kind: "no-player" }
  /** The backend no longer accepts the session token: sign in again. */
  | { kind: "signed-out" }
  /** Rate limited, down, unreachable, or answered with something off-contract. */
  | { kind: "unavailable"; retryAfter?: number }
  /** No backend is configured for this website. */
  | { kind: "not-connected" };

export interface ProgressSource {
  read(member: MemberPrincipal): Promise<ProgressState>;
}
