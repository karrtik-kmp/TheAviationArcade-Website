/**
 * Military Aircraft Identifier launch preparation. The questions are the client's Military
 * sheet exactly as supplied on 2026-10-26 (docs/Military Airplane Identifier v1.xlsx): one
 * entry per row with its rank, answer and three wrong answers. Ids match the game's import
 * (`mil-aN` for sheet row N). Staff check photographs and rights; changing a question needs
 * a new sheet from the client. Approval never publishes.
 */
export const militaryRankNames = [
  "Trainee",
  "First Officer",
  "Captain",
  "Check Airman",
  "Chief Pilot",
] as const;
export type MilitaryRank = (typeof militaryRankNames)[number];

/** Flights in a Trip. As in the game, a Trip never repeats a question. */
export const TRIP_SIZE = 10;
/** The game deals at most this many Flights from the pilot's own rank, the rest from ranks below. */
export const OWN_RANK_LIMIT = 6;

/** One row of the client's sheet. `file` is empty when the client has not supplied the photograph. */
export type MilitaryAircraft = {
  id: string;
  name: string;
  rank: MilitaryRank;
  wrong: string[];
  file: string;
  photographer: string;
};
const q = (
  id: string,
  rank: MilitaryRank,
  name: string,
  wrong: string[],
  file: string,
  photographer: string,
): MilitaryAircraft => ({ id, name, rank, wrong, file, photographer });
export const militaryRoster: MilitaryAircraft[] = [
  q("mil-a1", "Trainee", "Warthog A-10 Thunderbolt II", ["Sukhoi Su-25 Frogfoot", "Ilyushin Il-102", "Northrop YA-9"], "MA_A_10_10_23_26_1.jpg", "Tyler Hardie"),
  q("mil-a2", "First Officer", "Lockheed Martin F-16", ["Saab JAS 39 Gripen", "Chengdu J-10", "Dassault Mirage 2000"], "MA_F16_10_23_26_1.jpg", "Tyler Hardie"),
  q("mil-a3", "Trainee", "Lockheed Martin F-22 Raptor", ["Lockheed Martin F-35", "Northrop YF-23", "Chengdu J-20"], "MA_f22_10_23_26_1.jpg", "John Torcasio"),
  q("mil-a4", "Captain", "Eurofighter Typhoon", ["Dassault Rafale", "Saab JAS 39 Gripen", "Boeing F/A-18 Super Hornet"], "MA_Typhoon_102326_1.jpg", "Jonathan Ridley"),
  q("mil-a5", "Trainee", "Boeing C-17 Globemaster III", ["Airbus A400M Atlas", "Lockheed C-5M Super Galaxy", "Ilyushin Il-76"], "", "Vishu Joo"),
  q("mil-a6", "Captain", "Lockheed Martin F-35A Lightning II", ["Boeing X-32", "Shenyang J-35", "Sukhoi Su-75"], "MA_f35_102326_1.jpg", "David Hili"),
  q("mil-a7", "Chief Pilot", "Rockwell B-1B Lancer", ["Tupolev Tu-160", "Tupolev Tu-22M", "General Dynamics F-111"], "MA_B1b_102326_1.jpg", "Joshua Hoehne"),
  q("mil-a8", "Check Airman", "Eurofighter Typhoon", ["Dassault Rafale", "Saab JAS 39 Gripen", "Boeing F/A-18E/F Super Hornet"], "MA_Typhoon_102326_2.jpg", "Lincoln Holley"),
  q("mil-a9", "Check Airman", "Boeing F/A-18E/F Super Hornet", ["McDonnell Douglas F/A-18C/D Hornet", "Dassault Rafale M", "Mikoyan MiG-29K"], "MA_F18_102326_1.jpg", "Charles Causse"),
  q("mil-a10", "Check Airman", "Beriev A-50 Mainstay", ["Boeing E-3 Sentry", "Xi'an KJ-2000", "Beriev A-100 Premier"], "MA_A50_102326_1.jpg", "Elina Emurlaeva"),
  q("mil-a11", "Chief Pilot", "Eurocopter AS332 Super Puma", ["KAI KUH-1 Surion", "Sikorsky UH-60 Black Hawk", "NHIndustries NH90"], "MA_AS232_102326_1.jpg", "Defrino Maasy"),
  q("mil-a12", "Captain", "Lockheed C-130 Hercules", ["Antonov An-12 Cub", "Alenia C-27J Spartan", "Airbus A400M Atlas"], "MA_c130_102326_1.jpg", "Edoardo Bortoli"),
  q("mil-a13", "Captain", "Chance Vought F4U Corsair", ["Grumman F6F Hellcat", "Hawker Sea Fury", "Grumman F8F Bearcat"], "MA_F4U_102326_1.jpg", "Cook Aynne"),
  q("mil-a14", "Check Airman", "CAC Wirraway", ["CAC Boomerang", "Curtiss-Wright CW-22 Falcon", "Miles Master"], "MA_CAC1_102326_1.jpg", ""),
  q("mil-a15", "Chief Pilot", "C-47 Skytrain", ["Curtiss C-46 Commando", "Lockheed Model 18 Lodestar", "Lisunov Li-2 Cab"], "MA_C47_102326_1.jpg", "Cook Aynne"),
  q("mil-a16", "First Officer", "Lockheed Martin HC-130J Combat King II", ["Lockheed Martin KC-130J", "Embraer C-390 Millennium", "Airbus A400M Atlas"], "MA_HC130_102326_1.jpg", "Tyler Hardie"),
  q("mil-a17", "Check Airman", "North American T-28 Trojan", ["North American T-6 Texan", "Beechcraft T-34 Mentor", "Yakovlev Yak-52"], "MA_T28_102326_1.jpg", "Abraham Hughes"),
  q("mil-a18", "First Officer", "Lockheed Martin C-130J Super Hercules", ["Alenia C-27J Spartan", "Embraer C-390 Millennium", "Shaanxi Y-9"], "MA_C130_102326_2.jpg", "Tanvir Hasanat Rahat"),
  q("mil-a19", "Check Airman", "Mikoyan MiG-29UB Fulcrum-B", ["McDonnell Douglas F-15D Eagle", "Boeing F/A-18B/D Hornet", "Shenyang J-16"], "MA_Mig29_102326_1.jpg", "Bornil Amin"),
  q("mil-a20", "Captain", "North American T-6 Texan", ["CAC Wirraway", "Vultee BT-13 Valiant", "North American T-28 Trojan"], "MA_T6_102326_1.jpg", "Abraham Hughes"),
  q("mil-a21", "Chief Pilot", "Chengdu FT-7BGI", ["Mikoyan-Gurevich MiG-21UM", "Northrop T-38 Talon", "Dassault Mirage III B"], "MA_FT78_102326_1.jpg", "Bornil Amin"),
  q("mil-a22", "Chief Pilot", "AgustaWestland AW139", ["Airbus Helicopters H160", "Eurocopter AS365 Dauphin", "Sikorsky S-76"], "MA_AW139_102326_1.jpg", "Edoardo Bortoli"),
  q("mil-a23", "First Officer", "North American T-28 Trojan", ["North American T-6 Texan", "Beechcraft T-34 Mentor", "Yakovlev Yak-52"], "MA_T28_102326_2.jpg", ""),
  q("mil-a24", "Trainee", "Northrop Grumman B-2 Spirit", ["Northrop Grumman B-21 Raider", "Lockheed F-117 Nighthawk", "Xi'an H-20"], "MA_B2_102326_1.jpg", "Phyllis Lilienthal"),
  q("mil-a25", "Chief Pilot", "Grumman TBF / TBM Avenger", ["Curtiss SB2C Helldiver", "Douglas TBD Devastator", "Douglas A-1 Skyraider"], "MA_TBF_102426_1.jpg", ""),
  q("mil-a26", "Trainee", "Eurofighter Typhoon", ["Dassault Rafale", "Boeing F/A-18E/F Super Hornet", "Saab JAS 39 Gripen"], "MA_typhoon_102426_1.jpg", ""),
  q("mil-a27", "Check Airman", "AgustaWestland AW139", ["Airbus Helicopters H160", "Sikorsky S-76", "Bell 412"], "MA_AW139_102426_1.jpg", "Edoardo Bortoli"),
  q("mil-a28", "Captain", "Consolidated PBY Catalina", ["Martin PBM Mariner", "Short Sunderland", "Canadair CL-215"], "MA_pby_102426_1.jpg", "Cook Aynne"),
  q("mil-a29", "Trainee", "Boeing B-29 Superfortress", ["Convair B-36 Peacemaker", "Avro Lincoln", "Tupolev Tu-4 Bull"], "MA_B29_102426_1.jpg", "Benoit Lamarche"),
  q("mil-a30", "First Officer", "Dassault Mirage IIIE", ["Saab 35 Draken", "Convair F-106 Delta Dart", "IAI Nesher"], "MA_IIIE_102426_1.jpg", "Cook Aynne"),
  q("mil-a31", "Check Airman", "Hawker Hurricane", ["Supermarine Spitfire", "Messerschmitt Bf 109", "Curtiss P-40 Warhawk"], "MA_Hawker_102426_1.jpg", "Youssef Mubarak"),
];
export const militaryRanks = militaryRankNames.map((rank) => ({
  rank,
  count: militaryRoster.filter((a) => a.rank === rank).length,
}));

export const militaryStages = [
  "missing_photo",
  "rights_checked",
  "content_prepared",
  "previewed",
  "approved",
] as const;
export type MilitaryStage = (typeof militaryStages)[number];
export const stageNames: Record<MilitaryStage, string> = {
  missing_photo: "Missing photo",
  rights_checked: "Rights checked",
  content_prepared: "Content prepared",
  previewed: "Previewed",
  approved: "Approved",
};

export type MilitaryChecklist = {
  identity: boolean;
  answers: boolean;
  crop: boolean;
  clipperCard: boolean;
};
export const checklistNames: { key: keyof MilitaryChecklist; label: string }[] = [
  { key: "identity", label: "Aircraft identity matches the reference" },
  { key: "answers", label: "The client's answer and wrong answers fit this photograph" },
  { key: "crop", label: "Mobile crop shows the aircraft fairly" },
  { key: "clipperCard", label: "Military Clipper Card mapping is correct" },
];

export type MilitaryPackageData = {
  /** "submission": an approved contribution; "licensed": a separately licensed photograph. */
  photoSource: "" | "submission" | "licensed";
  submissionId: string;
  licenseUrl: string;
  permission: string;
  attribution: string;
  referenceUrl: string;
  /** The answer and wrong answers are always the client's sheet values (see clientContent). */
  answer: string;
  /** Not supplied by the client; kept empty. */
  aliases: string[];
  distractors: string[];
  /** Not supplied by the client; kept empty. */
  hint: string;
  /** Not supplied by the client; kept empty. */
  reveal: string;
  checklist: MilitaryChecklist;
  notes: string;
};
export type MilitaryPackage = {
  aircraftId: string;
  stage: MilitaryStage;
  data: MilitaryPackageData;
  version: number;
  updatedAt: string;
};

/** Replaces the question content with the client's sheet row; staff never author it. */
export function clientContent(
  aircraft: MilitaryAircraft,
  data: MilitaryPackageData,
): MilitaryPackageData {
  return {
    ...data,
    answer: aircraft.name,
    aliases: [],
    distractors: [...aircraft.wrong],
    hint: "",
    reveal: "",
  };
}

export function emptyPackageData(aircraft: MilitaryAircraft): MilitaryPackageData {
  return clientContent(aircraft, {
    photoSource: "",
    submissionId: "",
    licenseUrl: "",
    permission: "",
    attribution: aircraft.photographer,
    referenceUrl: "",
    answer: "",
    aliases: [],
    distractors: [],
    hint: "",
    reveal: "",
    checklist: { identity: false, answers: false, crop: false, clipperCard: false },
    notes: "",
  });
}

const https = (s: string) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(s.trim());
const norm = (s: string) => s.trim().toLowerCase();

/** What is still missing before a package can stand at `stage`. Each stage includes the earlier ones. */
export function stageErrors(stage: MilitaryStage, data: MilitaryPackageData): string[] {
  const at = militaryStages.indexOf(stage);
  const errors: string[] = [];
  if (at >= 1) {
    if (data.photoSource === "submission" && !data.submissionId.trim())
      errors.push("Choose the approved submission that supplies the photograph.");
    else if (data.photoSource === "licensed" && !https(data.licenseUrl))
      errors.push("Add the https link to the photograph's license or source.");
    else if (!data.photoSource) errors.push("Choose where the photograph comes from.");
    if (data.permission.trim().length < 10)
      errors.push("Record the permission or license terms in at least 10 characters.");
    if (data.attribution.trim().length < 2) errors.push("Add the attribution to display.");
  }
  if (at >= 2) {
    if (!https(data.referenceUrl))
      errors.push("Add an https reference that confirms the aircraft identity.");
    if (!data.answer.trim()) errors.push("Add the displayed answer.");
    const accepted = [data.answer, ...data.aliases].map(norm).filter(Boolean);
    const wrong = data.distractors.map(norm);
    if (wrong.length !== 3 || wrong.some((s) => !s))
      errors.push("Provide three wrong answers.");
    else if (new Set(wrong).size !== 3 || wrong.some((s) => accepted.includes(s)))
      errors.push("Wrong answers must differ from each other and from the answer and its aliases.");
  }
  if (at >= 3 && !data.checklist.crop)
    errors.push("Preview the mobile crop before marking the package previewed.");
  if (
    at >= 4 &&
    !checklistNames.every(({ key }) => data.checklist[key] === true)
  )
    errors.push("Complete every preview checklist item before approval.");
  return errors;
}

/** Packages move forward one stage at a time and may step back to any earlier stage. */
export function transitionError(
  from: MilitaryStage,
  to: MilitaryStage,
  data: MilitaryPackageData,
): string | null {
  const a = militaryStages.indexOf(from),
    b = militaryStages.indexOf(to);
  if (b < 0) return "Unknown preparation stage.";
  if (b > a + 1)
    return `Move to ${stageNames[militaryStages[a + 1]]} before ${stageNames[to]}.`;
  const errors = stageErrors(to, data);
  return errors.length ? errors.join(" ") : null;
}

/** Shape check for untrusted package data. Returns a normalized copy or null. */
export function parsePackageData(value: unknown): MilitaryPackageData | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const text = (key: string, max = 2400) =>
    typeof v[key] === "string" && (v[key] as string).length <= max ? (v[key] as string) : null;
  const list = (key: string, size?: number) =>
    Array.isArray(v[key]) &&
    (v[key] as unknown[]).length <= 12 &&
    (size === undefined || (v[key] as unknown[]).length === size) &&
    (v[key] as unknown[]).every((s) => typeof s === "string" && s.length <= 160)
      ? (v[key] as string[])
      : null;
  const checklist = v.checklist as Record<string, unknown> | undefined;
  const fields = {
    submissionId: text("submissionId", 80),
    licenseUrl: text("licenseUrl", 600),
    permission: text("permission"),
    attribution: text("attribution", 160),
    referenceUrl: text("referenceUrl", 600),
    answer: text("answer", 160),
    hint: text("hint", 600),
    reveal: text("reveal"),
    notes: text("notes"),
  };
  const aliases = list("aliases"),
    distractors = list("distractors", 3);
  if (
    !["", "submission", "licensed"].includes(v.photoSource as string) ||
    Object.values(fields).some((s) => s === null) ||
    !aliases ||
    !distractors ||
    !checklist ||
    typeof checklist !== "object" ||
    !checklistNames.every(({ key }) => typeof checklist[key] === "boolean")
  )
    return null;
  return {
    ...(fields as Record<keyof typeof fields, string>),
    photoSource: v.photoSource as MilitaryPackageData["photoSource"],
    aliases: aliases.map((s) => s.trim()).filter(Boolean),
    distractors: [...distractors],
    checklist: {
      identity: checklist.identity as boolean,
      answers: checklist.answers as boolean,
      crop: checklist.crop as boolean,
      clipperCard: checklist.clipperCard as boolean,
    },
  };
}

export type RankReadiness = {
  rank: MilitaryRank;
  /** Questions the client's sheet places at this rank. */
  slots: number;
  /** This rank's questions, by stage. */
  stages: Record<MilitaryStage, number>;
  approved: number;
  /** Approved questions a pilot at this rank can be dealt: this rank plus every earlier one. */
  eligibleApproved: number;
  eligibleTotal: number;
  /** A Trip of TRIP_SIZE different questions can be dealt from approved content. */
  tripReady: boolean;
};
export function readiness(
  packages: Pick<MilitaryPackage, "aircraftId" | "stage">[],
  roster: MilitaryAircraft[] = militaryRoster,
) {
  const stageOf = new Map(packages.map((p) => [p.aircraftId, p.stage]));
  let eligibleApproved = 0,
    eligibleTotal = 0;
  const ranks: RankReadiness[] = militaryRankNames.map((rank) => {
    const stages = Object.fromEntries(militaryStages.map((s) => [s, 0])) as Record<
      MilitaryStage,
      number
    >;
    const own = roster.filter((a) => a.rank === rank);
    for (const aircraft of own) stages[stageOf.get(aircraft.id) ?? "missing_photo"] += 1;
    eligibleApproved += stages.approved;
    eligibleTotal += own.length;
    return {
      rank,
      slots: own.length,
      stages,
      approved: stages.approved,
      eligibleApproved,
      eligibleTotal,
      tripReady: eligibleApproved >= TRIP_SIZE,
    };
  });
  const approved = ranks.reduce((n, r) => n + r.approved, 0);
  return {
    ranks,
    approved,
    total: roster.length,
    /** Every package approved. The playable integration still needs its own checks before launch. */
    allApproved: approved === roster.length,
  };
}

/** The stored photograph behind a package, as the server sees it at release time. */
export type ReleaseAsset = {
  status: string;
  games: boolean;
  demo: boolean;
  bytes: number;
  digest: string;
};

/** Identifies the exact package versions a preview or release was built from. */
export function releaseBasis(packages: Pick<MilitaryPackage, "aircraftId" | "version">[]) {
  return packages
    .map((p) => `${p.aircraftId}:${p.version}`)
    .sort()
    .join(",");
}

/**
 * Everything that blocks a batch release: every question in the client's sheet approved,
 * full Trips of TRIP_SIZE at every rank, and a stored, game-approved, real photograph per
 * question that no other question reuses.
 */
export function releaseErrors(
  packages: MilitaryPackage[],
  assets: Map<string, ReleaseAsset>,
  roster: MilitaryAircraft[] = militaryRoster,
): string[] {
  const errors: string[] = [];
  const report = readiness(packages, roster);
  for (const r of report.ranks)
    if (r.approved < r.slots)
      errors.push(`${r.rank}: ${r.approved} of ${r.slots} questions approved.`);
  for (const r of report.ranks)
    if (!r.tripReady)
      errors.push(
        `${r.rank}: a Trip needs ${TRIP_SIZE} approved questions at this rank or below; ${r.eligibleTotal} are in the client's sheet.`,
      );
  const byId = new Map(packages.map((p) => [p.aircraftId, p]));
  const digests = new Map<string, string>();
  for (const aircraft of roster) {
    const p = byId.get(aircraft.id);
    if (!p || p.stage !== "approved") continue;
    const label = `${aircraft.name} (${aircraft.rank})`;
    const id = p.data.photoSource === "submission" ? p.data.submissionId : "";
    const asset = id ? assets.get(id) : undefined;
    if (!asset) {
      errors.push(
        `${label}: link a stored photograph. Add the client's or a licensed photo through Contribute and approve it so the file is kept.`,
      );
      continue;
    }
    if (asset.demo || asset.status !== "approved" || !asset.games || asset.bytes <= 0)
      errors.push(`${label}: the photograph is no longer a real contribution approved for game use.`);
    const other = digests.get(asset.digest);
    if (other) errors.push(`${label}: uses the same photograph as ${other}.`);
    else digests.set(asset.digest, label);
  }
  return errors;
}

export type TripQuestion = {
  aircraftId: string;
  name: string;
  rank: MilitaryRank;
  submissionId: string;
  options: string[];
};
export type SampleTrip = { rank: MilitaryRank; questions: TripQuestion[] };

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One sample Trip per rank for staff review, dealt the way the game deals: up to
 * OWN_RANK_LIMIT approved questions at the rank, the rest from earlier ranks, topped up
 * from the rank itself when earlier ranks run short, never a question twice. Options are
 * the client's answer and wrong answers, shuffled. A rank without TRIP_SIZE approved
 * questions available has no sample.
 */
export function sampleTrips(
  packages: MilitaryPackage[],
  seed: string,
  roster: MilitaryAircraft[] = militaryRoster,
): SampleTrip[] {
  const approved = new Map(
    packages.filter((p) => p.stage === "approved").map((p) => [p.aircraftId, p]),
  );
  const random = seeded(seed);
  const trips: SampleTrip[] = [];
  for (const [order, rank] of militaryRankNames.entries()) {
    const rankOf = (a: MilitaryAircraft) => militaryRankNames.indexOf(a.rank);
    const own = shuffle(roster.filter((a) => a.rank === rank && approved.has(a.id)), random);
    const below = shuffle(roster.filter((a) => rankOf(a) < order && approved.has(a.id)), random);
    const picked = [
      ...new Set([...own.slice(0, OWN_RANK_LIMIT), ...below, ...own]),
    ].slice(0, TRIP_SIZE);
    if (picked.length < TRIP_SIZE) continue;
    trips.push({
      rank,
      questions: shuffle(picked, random).map((a) => {
        const { data } = approved.get(a.id)!;
        return {
          aircraftId: a.id,
          name: a.name,
          rank: a.rank,
          submissionId: data.submissionId,
          options: shuffle([a.name, ...a.wrong], random),
        };
      }),
    });
  }
  return trips;
}

/** Which release the game would receive, and the earlier releases restore steps back through. */
export type ReleasePointer = { current: number | null; history: number[] };
export type MilitaryRelease = {
  number: number;
  basis: string;
  aircraft: number;
  createdAt: string;
  /** "uploaded": a candidate that has never been live. "released": live now or earlier. */
  status: "uploaded" | "released";
};
