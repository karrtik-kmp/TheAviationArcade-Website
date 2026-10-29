/**
 * A labelled sample ProgressSource for local work without a backend (`PROGRESS_SOURCE=mock` in a
 * development build only). Deterministic per account and valid against the backend's Progress
 * contract; the page marks it as a sample. Thresholds are the backend catalog's rank thresholds.
 */
import { progressSchema, rankIds, type Progress, type ProgressSource } from "./source.ts";

const thresholds = [0, 10000, 50000, 100000, 400000];

function seeded(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    return hash / 4294967296;
  };
}

export function sampleProgress(userId: string): Progress {
  const random = seeded(userId);
  const statusPoints = Math.floor(random() * 120000);
  const certified = thresholds.filter((t) => statusPoints >= t).length - 1;
  const active = Math.floor(random() * (certified + 1));
  const next = certified + 1 < rankIds.length ? certified + 1 : null;
  return progressSchema.parse({
    version: 1 + Math.floor(random() * 400),
    statusPoints,
    miles: Math.floor(random() * 5000),
    hints: Math.floor(random() * 10),
    certifiedRank: rankIds[certified],
    activeRank: rankIds[active],
    pleasureCruise: active < certified,
    selectableRanks: rankIds.slice(0, certified + 1).reverse(),
    nextRank: next === null ? null : { rank: rankIds[next], statusPoints: thresholds[next] },
    perfectStreak: Math.floor(random() * 10),
    firstClassPass: false,
  });
}

export const mockProgressSource: ProgressSource = {
  async read(member) {
    return { kind: "progress", progress: sampleProgress(member.userId), sample: true };
  },
};
