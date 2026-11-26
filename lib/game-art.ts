import type { Game } from "@/lib/catalog";
import { sitePath } from "@/lib/paths";

/** The game's own module roundel (Unity Art/Branding/ModuleIcons, v2). */
const roundels: Record<string, string> = {
  "aircraft-identifier": "aircraft-identifier",
  "military-aircraft-identifier": "aircraft-identifier-military",
  "tail-identifier": "tail-identifier",
  "airport-spotter": "airport-spotter",
  "atc-match": "atc-match",
  "call-sign-match": "callsign-match",
  "code-search": "code-search",
  "runway-identifier": "runway-identifier",
};
export function roundelFor(game: Game) {
  return sitePath(`/media/games/roundel-${roundels[game.slug] ?? "aircraft-identifier"}.svg`);
}
