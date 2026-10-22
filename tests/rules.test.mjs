import test from "node:test";
import assert from "node:assert/strict";
import {
  editorialErrors,
  imageInfo,
  localDay,
  reviewError,
  submissionSchema,
  validDate,
} from "../lib/rules.ts";

const validSubmission = () => ({
  title: "Coastal approach",
  photographer: "A. Pilot",
  email: "pilot@example.test",
  portfolio: "",
  category: "aircraft",
  customCategory: "",
  targetGames: ["aircraft-identifier"],
  aircraft: "Boeing 737",
  airline: "Example Air",
  registration: "N123EA",
  location: "San Francisco",
  airportCode: "SFO",
  capturedOn: "2024-02-29",
  description: "A 737 turning onto final in clear afternoon light.",
  factualSource: "https://www.example.test/aircraft",
  credit: "A. Pilot",
  rightsBasis: "owner",
  rightsEvidence: "I took and own this photograph.",
  channels: ["games"],
  imageOrigin: "camera",
  consent: true,
});

function pngHeader(width = 640, height = 600) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpegHeader(width = 800, height = 600) {
  // SOI followed by one baseline SOF segment; enough for the header parser,
  // not a complete JPEG and not evidence of a decoder or malware scan.
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11,
  ]);
}

test("validDate accepts real calendar dates including leap day and rejects normalized or malformed dates", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2000-02-29"), true);
  assert.equal(validDate("1900-02-29"), false);
  assert.equal(validDate("2023-02-29"), false);
  assert.equal(validDate("2024-04-31"), false);
  assert.equal(validDate("24-02-29"), false);
  assert.equal(validDate("2024-2-09"), false);
});

test("localDay follows each timezone's calendar across UTC midnight and a DST jump", () => {
  const beforeUtcMidnight = new Date("2024-03-10T07:30:00.000Z");
  const afterUtcMidnight = new Date("2024-03-10T08:30:00.000Z");
  assert.equal(localDay("America/Los_Angeles", beforeUtcMidnight), "2024-03-09");
  assert.equal(localDay("America/Los_Angeles", afterUtcMidnight), "2024-03-10");
  assert.equal(localDay("Asia/Kolkata", beforeUtcMidnight), "2024-03-10");
  assert.equal(localDay("Asia/Kolkata", afterUtcMidnight), "2024-03-10");
  assert.throws(() => localDay("Mars/Olympus_Mons", afterUtcMidnight), /valid IANA timezone/);
});

test("imageInfo reads PNG and JPEG signatures and dimensions from small header fixtures", () => {
  assert.deepEqual(imageInfo(pngHeader(1024, 768)), { mime: "image/png", width: 1024, height: 768 });
  assert.deepEqual(imageInfo(jpegHeader(2048, 1536)), { mime: "image/jpeg", width: 2048, height: 1536 });
  assert.throws(() => imageInfo(pngHeader().subarray(0, 23)), /valid JPEG or PNG/);
  assert.throws(() => imageInfo(jpegHeader().subarray(0, 9)), /valid JPEG or PNG/);
  assert.throws(() => imageInfo(Uint8Array.from([0, 1, 2, 3, 4, 5])), /valid JPEG or PNG/);
});

test("submission schema accepts a complete proposal and enforces conditional category, capture date, and channels", () => {
  assert.equal(submissionSchema.safeParse(validSubmission()).success, true);

  const otherWithoutName = validSubmission();
  otherWithoutName.category = "other";
  assert.ok(submissionSchema.safeParse(otherWithoutName).error.flatten().fieldErrors.customCategory);

  const aircraftWithoutModel = validSubmission();
  aircraftWithoutModel.aircraft = "x";
  assert.ok(submissionSchema.safeParse(aircraftWithoutModel).error.flatten().fieldErrors.aircraft);

  const impossibleDay = validSubmission();
  impossibleDay.capturedOn = "2023-02-29";
  assert.ok(submissionSchema.safeParse(impossibleDay).error.flatten().fieldErrors.capturedOn);

  const future = validSubmission();
  future.capturedOn = "2999-12-31";
  assert.ok(submissionSchema.safeParse(future).error.flatten().fieldErrors.capturedOn);

  const noProposedUse = validSubmission();
  noProposedUse.channels = [];
  assert.ok(submissionSchema.safeParse(noProposedUse).error.flatten().fieldErrors.channels);
});

test("submission schema rejects unsafe links, missing consent, and invalid rights or origin claims", () => {
  for (const value of ["http://example.test/photo", "javascript:alert(1)", "https://", "https:// bad host.test"]) {
    const data = validSubmission();
    data.portfolio = value;
    assert.ok(submissionSchema.safeParse(data).error.flatten().fieldErrors.portfolio, value);
  }
  const noSource = validSubmission();
  noSource.factualSource = "http://example.test/facts";
  assert.ok(submissionSchema.safeParse(noSource).error.flatten().fieldErrors.factualSource);
  const noConsent = validSubmission();
  noConsent.consent = false;
  assert.ok(submissionSchema.safeParse(noConsent).error.flatten().fieldErrors.consent);
  const unknownRights = validSubmission();
  unknownRights.rightsBasis = "someone-said-so";
  assert.ok(submissionSchema.safeParse(unknownRights).error.flatten().fieldErrors.rightsBasis);
  const unknownOrigin = validSubmission();
  unknownOrigin.imageOrigin = "downloaded";
  assert.ok(submissionSchema.safeParse(unknownOrigin).error.flatten().fieldErrors.imageOrigin);
});

test("approval requires all review checks, rights evidence, source, and non-generated photography", () => {
  const data = validSubmission();
  const allChecks = { identity: true, quality: true, credit: true, rights: true, category: true };
  assert.match(reviewError(data, "pending", "approved", {}, "") ?? "", /five verification checks/);
  assert.match(reviewError(data, "pending", "approved", { ...allChecks, rights: false }, "") ?? "", /five verification checks/);
  assert.match(reviewError({ ...data, rightsEvidence: "short" }, "pending", "approved", allChecks, "") ?? "", /permission or license evidence/);
  assert.match(reviewError({ ...data, factualSource: "" }, "pending", "approved", allChecks, "") ?? "", /factual source/);
  assert.match(reviewError({ ...data, imageOrigin: "generated" }, "pending", "approved", allChecks, "") ?? "", /Generated artwork/);
  assert.equal(reviewError(data, "pending", "approved", allChecks, ""), null);
  assert.match(reviewError(data, "pending", "rejected", allChecks, "no reason") ?? "", /at least 10 characters/);
  assert.equal(reviewError(data, "pending", "rejected", allChecks, "Rights could not be verified."), null);
  assert.match(reviewError(data, "rejected", "approved", allChecks, "" ) ?? "", /cannot be approved/);
  assert.match(reviewError(data, "pending", "pending", allChecks, "") ?? "", /resubmit/);
});

test("editorial checks reject repeated choices after case and whitespace normalization", () => {
  const data = {
    title: "Aircraft near the coast",
    aircraft: "Boeing 737",
    photographer: "A. Pilot",
    credit: "A. Pilot",
    description: "A factual description of this aircraft and where it was photographed.",
    correctAnswer: "Boeing 737",
    distractors: ["Airbus A320", " boeing 737 ", "Embraer E190"],
    difficulty: "Captain",
    factualSource: "https://www.example.test/aircraft",
    imageUrl: "/api/submissions/example/photo",
  };
  assert.ok(editorialErrors("identifier", data).some((error) => /different/.test(error)));
  data.distractors = ["Airbus A320", "Airbus A330", "Embraer E190"];
  assert.deepEqual(editorialErrors("identifier", data), []);
  data.difficulty = "Novice";
  assert.ok(editorialErrors("identifier", data).some((error) => /supported rank/.test(error)));
  assert.ok(editorialErrors("potd", { ...data, description: "Short" }).some((error) => /factual context/.test(error)));
});
