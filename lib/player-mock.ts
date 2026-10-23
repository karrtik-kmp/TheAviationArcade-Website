import { games } from "@/lib/catalog";

/**
 * MOCK. App/website account linking and player name-tag profiles have no
 * backend yet. This stands in for that API so the player area can be built;
 * replace `playerProfile` with a real fetch and keep the `PlayerProfile` shape
 * as the contract.
 */
export type PlayerProfile = {
  nameTag: string;
  appLink: { status: "not-linked" };
  rankTitle: string;
  skillPoints: number;
  gamesPlayed: number;
  bestStreak: number;
  recent: {
    gameSlug: string;
    gameName: string;
    score: number;
    playedAt: string;
  }[];
};

function seeded(text: string) {
  let hash = 2166136261;
  for (const char of text)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    return hash / 4294967296;
  };
}

const ranks = ["Student Pilot", "Private Pilot", "First Officer", "Captain"];

/** Deterministic per account, so a reload shows the same mock profile. */
export function playerProfile(user: {
  userId: string;
  displayName: string;
}): PlayerProfile {
  const random = seeded(user.userId);
  const tag =
    user.displayName.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "Pilot";
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 23);
  return {
    nameTag: `${tag}#${String(Math.floor(random() * 9000) + 1000)}`,
    appLink: { status: "not-linked" },
    rankTitle: ranks[Math.floor(random() * ranks.length)],
    skillPoints: Math.floor(random() * 40000),
    gamesPlayed: Math.floor(random() * 300),
    bestStreak: Math.floor(random() * 40),
    recent: games.slice(0, 4).map((game, index) => ({
      gameSlug: game.slug,
      gameName: game.name,
      score: Math.floor(random() * 2000),
      playedAt: new Date(now - (index + 1) * day).toISOString(),
    })),
  };
}
