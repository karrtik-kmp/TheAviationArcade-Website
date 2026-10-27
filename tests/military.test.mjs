import test from "node:test";
import assert from "node:assert/strict";
import {
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
  licenseUrl: "https://example.org/license/f16",
  permission: "Licensed for in-game use, worldwide, 2026.",
  attribution: "Example Photo Agency",
  referenceUrl: "https://www.af.mil/About-Us/Fact-Sheets/",
  aliases: ["F-16", "Viper"],
  distractors: ["F-15 Eagle", "Mirage 2000", "JF-17 Thunder"],
  hint: "Single engine, bubble canopy",
  reveal: "The F-16's ventral intake and single tail identify it.",
  checklist: { identity: true, answers: true, crop: true, clipperCard: true },
});

test("roster matches the approved rank slots: 14/6/4/3/3 with 30 distinct aircraft", () => {
  assert.deepEqual(
    militaryRanks.map((r) => r.count),
    [14, 6, 4, 3, 3],
  );
  for (const { rank, count } of militaryRanks)
    assert.equal(militaryRoster.filter((a) => a.rank === rank).length, count);
  assert.equal(new Set(militaryRoster.map((a) => a.id)).size, 30);
  assert.ok(militaryRoster.some((a) => a.id === "f-a-18-hornet"));
});

test("each stage requires its own evidence plus every earlier stage's", () => {
  const empty = emptyPackageData(militaryRoster[0]);
  assert.deepEqual(stageErrors("missing_photo", empty), []);
  assert.ok(stageErrors("rights_checked", empty).length >= 3);
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
});

test("wrong answers must be distinct and never match the answer or an alias", () => {
  assert.deepEqual(stageErrors("content_prepared", complete()), []);
  const alias = { ...complete(), distractors: ["viper ", "F-15 Eagle", "MiG-29"] };
  assert.ok(stageErrors("content_prepared", alias).some((e) => /differ/.test(e)));
  const repeat = { ...complete(), distractors: ["MiG-29", "mig-29", "F-15 Eagle"] };
  assert.ok(stageErrors("content_prepared", repeat).some((e) => /differ/.test(e)));
  const blank = { ...complete(), distractors: ["MiG-29", "", "F-15 Eagle"] };
  assert.ok(stageErrors("content_prepared", blank).some((e) => /three/.test(e)));
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

test("package parsing rejects malformed or oversized input and normalizes aliases", () => {
  const parsed = parsePackageData({ ...complete(), aliases: [" F-16 ", "", "Viper"] });
  assert.deepEqual(parsed.aliases, ["F-16", "Viper"]);
  assert.equal(parsePackageData(null), null);
  assert.equal(parsePackageData({ ...complete(), photoSource: "web" }), null);
  assert.equal(parsePackageData({ ...complete(), distractors: ["a", "b"] }), null);
  assert.equal(parsePackageData({ ...complete(), attribution: "x".repeat(161) }), null);
  assert.equal(parsePackageData({ ...complete(), checklist: { identity: true } }), null);
  assert.equal(parsePackageData({ ...complete(), hint: 5 }), null);
});

test("readiness counts each rank, inherits earlier ranks and gates Trips on ten approved types", () => {
  const none = readiness([]);
  assert.equal(none.approved, 0);
  assert.equal(none.allApproved, false);
  assert.equal(none.ranks[0].stages.missing_photo, 14);
  assert.deepEqual(
    none.ranks.map((r) => r.eligibleTotal),
    [14, 20, 24, 27, 30],
  );
  assert.ok(none.ranks.every((r) => !r.tripReady));

  const trainee = militaryRoster.filter((a) => a.rank === "Trainee");
  const nine = readiness(trainee.slice(0, 9).map((a) => ({ aircraftId: a.id, stage: "approved" })));
  assert.equal(nine.ranks[0].tripReady, false);
  const ten = readiness(trainee.slice(0, 10).map((a) => ({ aircraftId: a.id, stage: "approved" })));
  assert.equal(ten.ranks[0].tripReady, true);
  assert.equal(ten.ranks[4].eligibleApproved, 10);

  // Unknown ids (e.g. a retired roster entry) are ignored, never counted.
  const all = readiness([
    ...militaryRoster.map((a) => ({ aircraftId: a.id, stage: "approved" })),
    { aircraftId: "not-on-roster", stage: "approved" },
  ]);
  assert.equal(all.approved, 30);
  assert.equal(all.allApproved, true);
});

const approvedAll = () =>
  militaryRoster.map((a, i) => ({
    aircraftId: a.id,
    stage: "approved",
    version: 4,
    updatedAt: "",
    data: {
      ...complete(),
      answer: a.name,
      photoSource: "submission",
      submissionId: `photo-${i}`,
      distractors: ["Wrong one", "Wrong two", "Wrong three"],
    },
  }));
const assetsFor = (packages, change = () => ({})) =>
  new Map(
    packages.map((p, i) => [
      p.data.submissionId,
      { status: "approved", games: true, demo: false, bytes: 1000, digest: `d${i}`, ...change(p, i) },
    ]),
  );

test("release needs every slot approved with its own stored, game-approved photograph", () => {
  const all = approvedAll();
  assert.deepEqual(releaseErrors(all, assetsFor(all)), []);

  const short = all.slice(1);
  assert.ok(releaseErrors(short, assetsFor(short)).some((e) => /Trainee: 13 of 14/.test(e)));

  const licensed = all.map((p, i) => (i ? p : { ...p, data: { ...p.data, photoSource: "licensed" } }));
  assert.ok(releaseErrors(licensed, assetsFor(all)).some((e) => /F-16.*stored photograph/.test(e)));

  const revoked = assetsFor(all, (_, i) => (i === 2 ? { status: "rejected" } : {}));
  assert.ok(releaseErrors(all, revoked).some((e) => /F-22.*no longer/.test(e)));
  const demo = assetsFor(all, (_, i) => (i === 2 ? { demo: true } : {}));
  assert.ok(releaseErrors(all, demo).some((e) => /F-22.*no longer/.test(e)));

  const reused = assetsFor(all, (_, i) => (i === 1 ? { digest: "d0" } : {}));
  assert.ok(releaseErrors(all, reused).some((e) => /F-15 Eagle: uses the same photograph as F-16/.test(e)));
});

test("release basis names exact package versions regardless of order", () => {
  const a = { aircraftId: "b", version: 2 }, b = { aircraftId: "a", version: 1 };
  assert.equal(releaseBasis([a, b]), "a:1,b:2");
  assert.equal(releaseBasis([b, a]), releaseBasis([a, b]));
  assert.notEqual(releaseBasis([{ ...a, version: 3 }, b]), releaseBasis([a, b]));
});

test("sample Trips: ten different aircraft per rank, rank's own aircraft first, reproducible", () => {
  const all = approvedAll();
  const trips = sampleTrips(all, "seed");
  assert.deepEqual(trips.map((t) => t.rank), militaryRanks.map((r) => r.rank));
  for (const trip of trips) {
    assert.equal(new Set(trip.questions.map((q) => q.aircraftId)).size, 10);
    const order = militaryRanks.findIndex((r) => r.rank === trip.rank);
    assert.ok(trip.questions.every((q) => militaryRanks.findIndex((r) => r.rank === q.rank) <= order));
    const own = militaryRoster.filter((a) => a.rank === trip.rank).length;
    assert.equal(trip.questions.filter((q) => q.rank === trip.rank).length, Math.min(own, 10));
    for (const q of trip.questions) {
      assert.equal(q.options.length, 4);
      assert.ok(q.options.includes(q.name));
    }
  }
  assert.deepEqual(sampleTrips(all, "seed"), trips);
  assert.notDeepEqual(sampleTrips(all, "other"), trips);

  // Unapproved packages never appear; a rank short of ten has no sample.
  const nine = all.map((p, i) => (i >= 9 ? { ...p, stage: "previewed" } : p));
  assert.equal(sampleTrips(nine, "seed").length, 0);
});
