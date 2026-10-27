/**
 * Military Aircraft Identifier launch preparation. The roster and rank slots are the
 * client-approved launch direction (docs/APPROVED_WEBSITE_DIRECTION.md). Changing an
 * aircraft needs client approval and keeps its rank slot. Approval never publishes.
 */
export const militaryRanks = [
  { rank: "Trainee", count: 14 },
  { rank: "First Officer", count: 6 },
  { rank: "Captain", count: 4 },
  { rank: "Check Airman", count: 3 },
  { rank: "Chief Pilot", count: 3 },
] as const;
export type MilitaryRank = (typeof militaryRanks)[number]["rank"];

/** Aircraft in a Trip. Each Trip needs this many different aircraft types. */
export const TRIP_SIZE = 10;

const names: Record<MilitaryRank, string[]> = {
  Trainee: [
    "F-16 Fighting Falcon",
    "F-15 Eagle",
    "F-22 Raptor",
    "F-35 Lightning II",
    "A-10 Thunderbolt II",
    "B-2 Spirit",
    "B-52 Stratofortress",
    "C-130 Hercules",
    "C-17 Globemaster III",
    "E-3 Sentry",
    "U-2 Dragon Lady",
    "SR-71 Blackbird",
    "Harrier",
    "MiG-21",
  ],
  "First Officer": [
    "F-14 Tomcat",
    "F/A-18 Hornet",
    "Eurofighter Typhoon",
    "Dassault Rafale",
    "Airbus A400M Atlas",
    "B-1 Lancer",
  ],
  Captain: ["Saab Gripen", "Dassault Mirage 2000", "MiG-29", "BAE Hawk"],
  "Check Airman": ["HAL Tejas", "Leonardo M-346", "A-29 Super Tucano"],
  "Chief Pilot": ["JF-17 Thunder", "Pilatus PC-21", "Kawasaki P-1"],
};
export type MilitaryAircraft = { id: string; name: string; rank: MilitaryRank };
export function aircraftSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export const militaryRoster: MilitaryAircraft[] = militaryRanks.flatMap(
  ({ rank }) => names[rank].map((name) => ({ id: aircraftSlug(name), name, rank })),
);

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
  { key: "answers", label: "Wrong answers are plausible and unambiguous" },
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
  answer: string;
  aliases: string[];
  distractors: string[];
  hint: string;
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

export function emptyPackageData(aircraft: MilitaryAircraft): MilitaryPackageData {
  return {
    photoSource: "",
    submissionId: "",
    licenseUrl: "",
    permission: "",
    attribution: "",
    referenceUrl: "",
    answer: aircraft.name,
    aliases: [],
    distractors: ["", "", ""],
    hint: "",
    reveal: "",
    checklist: { identity: false, answers: false, crop: false, clipperCard: false },
    notes: "",
  };
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
    if (data.hint.trim().length < 5) errors.push("Add a hint.");
    if (data.reveal.trim().length < 15)
      errors.push("Add a reveal explanation of at least 15 characters.");
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
  slots: number;
  /** Aircraft introduced at this rank, by stage. */
  stages: Record<MilitaryStage, number>;
  approved: number;
  /** Approved aircraft a player at this rank can meet: this rank plus every earlier one. */
  eligibleApproved: number;
  eligibleTotal: number;
  /** A Trip of TRIP_SIZE different aircraft types can be assembled from approved content. */
  tripReady: boolean;
};
export function readiness(packages: Pick<MilitaryPackage, "aircraftId" | "stage">[]) {
  const stageOf = new Map(packages.map((p) => [p.aircraftId, p.stage]));
  let eligibleApproved = 0,
    eligibleTotal = 0;
  const ranks: RankReadiness[] = militaryRanks.map(({ rank, count }) => {
    const stages = Object.fromEntries(militaryStages.map((s) => [s, 0])) as Record<
      MilitaryStage,
      number
    >;
    for (const aircraft of militaryRoster.filter((a) => a.rank === rank))
      stages[stageOf.get(aircraft.id) ?? "missing_photo"] += 1;
    eligibleApproved += stages.approved;
    eligibleTotal += count;
    return {
      rank,
      slots: count,
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
    total: militaryRoster.length,
    /** Every package approved. The playable integration still needs its own checks before launch. */
    allApproved: approved === militaryRoster.length,
  };
}
