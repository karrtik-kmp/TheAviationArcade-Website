import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = process.argv[2];
if (!root || !path.isAbsolute(root)) throw new Error("Supply the absolute Unity project root.");
const provenance = [];
async function source(file) {
  const text = await readFile(path.join(root, file), "utf8");
  provenance.push({ path: file, sha256: createHash("sha256").update(text).digest("hex") });
  return text;
}
const content = "Assets/_Project/Resources/ClientContent/";
async function pack(file) { return JSON.parse(await source(content + file)); }
const identifier = await pack("identifier_questions.json");
const potd = await pack("potd.json");
const atc = await pack("Arcade/atc_airports.json");
const callsign = await pack("Arcade/callsign_airlines.json");
const codeSearch = await pack("Arcade/code_search_puzzles.json");
const tail = await pack("Arcade/tail_questions.json");
const scripts = "Assets/_Project/Scripts/";
const registry = await source(scripts + "Gameplay/Modules/ModuleRegistry.cs");
const modules = [...registry.matchAll(/new ModuleDescriptor\(ModuleId\.(\w+), "([^"]+)", "([^"]+)",\s*"([^"]+)"/g)]
  .map(([, id, slug, backendId, name]) => ({ id, slug, backendId, name,
    status: ["AircraftIdentifier", "TailIdentifier", "AtcMatch", "CallSignMatch", "CodeSearch"].includes(id) ? "Bundled demo" : "Coming Soon" }));
if (modules.length !== 8) throw new Error("Registry changed; review module mapping before importing.");
const ranks = await source(scripts + "Gameplay/Progression/FlightRankThresholds.cs");
const thresholds = [...ranks.matchAll(/public const long (\w+) = ([\d_]+);/g)]
  .map(([, rank, points]) => ({ rank: rank.replace(/([a-z])([A-Z])/g, "$1 $2"), statusPoints: Number(points.replaceAll("_", "")) }));
const hintSource = await source(scripts + "Gameplay/Economy/HintBank.cs");
const hints = Object.fromEntries([...hintSource.matchAll(/public const int (\w+) = (\d+);/g)]
  .map(([, key, value]) => [key, Number(value)]));
for (const file of ["Infrastructure/Persistence/PlayerPrefsSettingsRepository.cs", "Presentation/UI/FeedbackCues.cs", "Presentation/UI/Theming/ThemeManager.cs", "Infrastructure/DevMock/InProcessMockBackend.cs"])
  await source(scripts + file);
const snapshot = {
  schemaVersion: 1, sourceDate: "2026-10-23", demoOnly: true,
  defaults: { livery: "Chartroom", sound: true, navigationVibration: true, gameplayVibration: true,
    reducedMotion: false, untimedMode: false, miles: 0, statusPoints: 0, callsign: null,
    dailyReset: "Player local midnight", monetization: false },
  hints, thresholds, modules, identifier: identifier.questions, potd: potd.entries,
  atc, callsign, codeSearch, tail, provenance,
};
await writeFile(new URL("../data/demo-game-content.json", import.meta.url), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Imported ${snapshot.identifier.length} questions, ${snapshot.potd.length} daily features and ${modules.length} catalog entries. Metadata only; no publication rights granted.`);
