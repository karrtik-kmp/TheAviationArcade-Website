import test from "node:test";
import assert from "node:assert/strict";
import {
  clientContent,
  emptyPackageData,
  militaryRanks,
  militaryRoster,
  parsePackageData,
  readiness,
  releaseBasis,
  releaseErrors,
  sampleTrips,
  stageErrors,
  transitionError,
} from "../lib/military.ts";

const complete = () => ({
  ...emptyPackageData(militaryRoster[0]),
  photoSource: "licensed",
  licenseUrl: "https://example.org/license/a10",
  permission: "Licensed for in-game use, worldwide, 2026.",
  attribution: "Example Photo Agency",
  referenceUrl: "https://www.af.mil/About-Us/Fact-Sheets/",
  checklist: { identity: true, answers: true, crop: true, clipperCard: true },
});

test("roster is the client's Military sheet: 31 rows, game ids, ranks as supplied", () => {
  assert.equal(militaryRoster.length, 31);
  assert.deepEqual(
    militaryRoster.map((a) => a.id),
    Array.from({ length: 31 }, (_, i) => `mil-a${i + 1}`),
  );
  assert.deepEqual(
    militaryRanks.map((r) => r.count),
    [6, 5, 6, 8, 6],
  );
  for (const a of militaryRoster) {
    assert.equal(a.wrong.length, 3, a.id);
    assert.equal(new Set([a.name, ...a.wrong]).size, 4, a.id);
  }
  const row = (id) => militaryRoster.find((a) => a.id === id);
  assert.deepEqual(row("mil-a1"), {
    id: "mil-a1",
    name: "Warthog A-10 Thunderbolt II",
    rank: "Trainee",
    wrong: ["Sukhoi Su-25 Frogfoot", "Ilyushin Il-102", "Northrop YA-9"],
    file: "MA_A_10_10_23_26_1.jpg",
    photographer: "Tyler Hardie",
  });
  // The C-17 row came without its photograph; the client sheet repeats some aircraft at several ranks.
  assert.equal(row("mil-a5").file, "");
  assert.equal(militaryRoster.filter((a) => a.name === "Eurofighter Typhoon").length, 3);
});

test("question content always comes from the client's sheet", () => {
  const a = militaryRoster[8];
  const edited = clientContent(a, {
    ...complete(),
    answer: "F/A-18 Hornet",
    aliases: ["Rhino"],
    distractors: ["x", "y", "z"],
    hint: "Two tails",
    reveal: "An invented explanation.",
  });
  assert.equal(edited.answer, a.name);
  assert.deepEqual(edited.distractors, a.wrong);
  assert.deepEqual(edited.aliases, []);
  assert.equal(edited.hint, "");
  assert.equal(edited.reveal, "");
  assert.equal(emptyPackageData(a).attribution, "Charles Causse");
  assert.equal(emptyPackageData(militaryRoster[13]).attribution, "");
});

test("each stage requires its own evidence plus every earlier stage's", () => {
  const empty = emptyPackageData(militaryRoster[0]);
  assert.deepEqual(stageErrors("missing_photo", empty), []);
  assert.ok(stageErrors("rights_checked", empty).length >= 2);
  assert.deepEqual(stageErrors("approved", complete()), []);
  const noRights = { ...complete(), permission: "" };
  assert.ok(stageErrors("approved", noRights).some((e) => /permission/.test(e)));
  assert.ok(
    stageErrors("rights_checked", { ...complete(), licenseUrl: "http://x.org" }).length,
  );
  assert.ok(
    stageErrors("rights_checked", { ...complete(), photoSource: "submission", submissionId: "" })
      .some((e) => /submission/.test(e)),
  );
  assert.ok(stageErrors("content_prepared", { ...complete(), referenceUrl: "" }).length);
});

test("every client row passes the content checks without a hint or reveal", () => {
  for (const a of militaryRoster)
    assert.deepEqual(
      stageErrors("content_prepared", { ...clientContent(a, complete()) }),
      [],
      a.id,
    );
});

test("approval needs the full preview checklist; preview needs the mobile crop", () => {
  const unchecked = { ...complete(), checklist: { identity: true, answers: true, crop: true, clipperCard: false } };
  assert.deepEqual(stageErrors("previewed", unchecked), []);
  assert.ok(stageErrors("approved", unchecked).length);
  const noCrop = { ...complete(), checklist: { ...complete().checklist, crop: false } };
  assert.ok(stageErrors("previewed", noCrop).length);
});

test("packages advance one stage at a time and can always step back", () => {
  const data = complete();
  assert.equal(transitionError("missing_photo", "rights_checked", data), null);
  assert.match(transitionError("missing_photo", "approved", data), /Rights checked/);
  assert.equal(transitionError("previewed", "approved", data), null);
  assert.equal(transitionError("approved", "missing_photo", emptyPackageData(militaryRoster[0])), null);
  assert.match(transitionError("previewed", "published", data), /Unknown/);
});

test("package parsing rejects malformed or oversized input", () => {
  assert.equal(parsePackageData(null), null);
  assert.equal(parsePackageData({ ...complete(), photoSource: "web" }), null);
  assert.equal(parsePackageData({ ...complete(), distractors: ["a", "b"] }), null);
  assert.equal(parsePackageData({ ...complete(), attribution: "x".repeat(161) }), null);
  assert.equal(parsePackageData({ ...complete(), checklist: { identity: true } }), null);
  assert.equal(parsePackageData({ ...complete(), hint: 5 }), null);
  assert.deepEqual(parsePackageData(complete()), complete());
});

const approve = (roster) => roster.map((a) => ({ aircraftId: a.id, stage: "approved" }));

test("readiness follows the sheet: ranks inherit earlier ranks; Trainee is short of a Trip", () => {
  const none = readiness([]);
  assert.equal(none.approved, 0);
  assert.equal(none.allApproved, false);
  assert.equal(none.ranks[0].stages.missing_photo, 6);
  assert.deepEqual(
    none.ranks.map((r) => r.eligibleTotal),
    [6, 11, 17, 25, 31],
  );
  assert.ok(none.ranks.every((r) => !r.tripReady));

  // Unknown ids (e.g. the earlier invented roster) are ignored, never counted.
  const all = readiness([...approve(militaryRoster), { aircraftId: "f-16-fighting-falcon", stage: "approved" }]);
  assert.equal(all.approved, 31);
  assert.equal(all.allApproved, true);
  assert.deepEqual(
    all.ranks.map((r) => r.tripReady),
    [false, true, true, true, true],
  );
});

// A roster that can fill every Trip, for the parts of release the client's sheet cannot reach yet.
const full = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Trainee ${i}`, rank: "Trainee", wrong: ["a", "b", "c"], file: "f", photographer: "" })),
  ...["First Officer", "Captain", "Check Airman", "Chief Pilot"].map((rank, i) => ({
    id: `r${i}`, name: `${rank} aircraft`, rank, wrong: ["a", "b", "c"], file: "f", photographer: "",
  })),
];
const approvedAll = (roster) =>
  roster.map((a, i) => ({
    aircraftId: a.id,
    stage: "approved",
    version: 4,
    updatedAt: "",
    data: { ...clientContent(a, complete()), photoSource: "submission", submissionId: `photo-${i}` },
  }));
const assetsFor = (packages, change = () => ({})) =>
  new Map(
    packages.map((p, i) => [
      p.data.submissionId,
      { status: "approved", games: true, demo: false, bytes: 1000, digest: `d${i}`, ...change(p, i) },
    ]),
  );

test("the client's sheet, fully approved, is refused only for the short Trainee Trip", () => {
  const all = approvedAll(militaryRoster);
  assert.deepEqual(releaseErrors(all, assetsFor(all)), [
    "Trainee: a Trip needs 10 approved questions at this rank or below; 6 are in the client's sheet.",
  ]);
});

test("release needs every question approved with its own stored, game-approved photograph", () => {
  const all = approvedAll(full);
  assert.deepEqual(releaseErrors(all, assetsFor(all), full), []);

  const short = all.slice(1);
  assert.ok(releaseErrors(short, assetsFor(short), full).some((e) => /Trainee: 9 of 10 questions/.test(e)));

  const licensed = all.map((p, i) => (i ? p : { ...p, data: { ...p.data, photoSource: "licensed" } }));
  assert.ok(releaseErrors(licensed, assetsFor(all), full).some((e) => /Trainee 0 \(Trainee\).*stored photograph/.test(e)));

  const revoked = assetsFor(all, (_, i) => (i === 2 ? { status: "rejected" } : {}));
  assert.ok(releaseErrors(all, revoked, full).some((e) => /Trainee 2.*no longer/.test(e)));
  const demo = assetsFor(all, (_, i) => (i === 2 ? { demo: true } : {}));
  assert.ok(releaseErrors(all, demo, full).some((e) => /Trainee 2.*no longer/.test(e)));

  const reused = assetsFor(all, (_, i) => (i === 1 ? { digest: "d0" } : {}));
  assert.ok(
    releaseErrors(all, reused, full).some((e) => /Trainee 1 \(Trainee\): uses the same photograph as Trainee 0/.test(e)),
  );
});

test("release basis names exact package versions regardless of order", () => {
  const a = { aircraftId: "b", version: 2 }, b = { aircraftId: "a", version: 1 };
  assert.equal(releaseBasis([a, b]), "a:1,b:2");
  assert.equal(releaseBasis([b, a]), releaseBasis([a, b]));
  assert.notEqual(releaseBasis([{ ...a, version: 3 }, b]), releaseBasis([a, b]));
});

test("sample Trips deal like the game: up to six at the rank, the rest from below, reproducible", () => {
  const all = approvedAll(militaryRoster);
  const trips = sampleTrips(all, "seed");
  assert.deepEqual(trips.map((t) => t.rank), ["First Officer", "Captain", "Check Airman", "Chief Pilot"]);
  for (const trip of trips) {
    assert.equal(new Set(trip.questions.map((q) => q.aircraftId)).size, 10);
    const order = militaryRanks.findIndex((r) => r.rank === trip.rank);
    assert.ok(trip.questions.every((q) => militaryRanks.findIndex((r) => r.rank === q.rank) <= order));
    const own = militaryRoster.filter((a) => a.rank === trip.rank).length;
    assert.equal(trip.questions.filter((q) => q.rank === trip.rank).length, Math.min(own, 6));
    for (const q of trip.questions) {
      const row = militaryRoster.find((a) => a.id === q.aircraftId);
      assert.deepEqual([...q.options].sort(), [row.name, ...row.wrong].sort());
    }
  }
  assert.deepEqual(sampleTrips(all, "seed"), trips);
  assert.notDeepEqual(sampleTrips(all, "other"), trips);

  // Thin ranks below top up from the rank itself; unapproved packages never appear.
  const thin = [
    ...full.slice(0, 2),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, name: `FO ${i}`, rank: "First Officer", wrong: ["a", "b", "c"], file: "f", photographer: "" })),
  ];
  const [fo] = sampleTrips(approvedAll(thin), "seed", thin);
  assert.equal(fo.rank, "First Officer");
  assert.equal(fo.questions.filter((q) => q.rank === "First Officer").length, 8);
  const nine = all.map((p) => (p.aircraftId === "mil-a2" ? { ...p, stage: "previewed" } : p));
  assert.ok(!sampleTrips(nine, "seed").some((t) => t.questions.some((q) => q.aircraftId === "mil-a2")));
});
