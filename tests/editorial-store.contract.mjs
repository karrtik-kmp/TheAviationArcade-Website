// The EditorialStore contract. Every adapter must pass it; editorial-store.test.mjs runs it.
// makeHarness({ roster, photos }) returns { store, audits(), changePhoto(id, patch) }.
// The fixture roster has ten Trainee questions so a release can succeed; the client's real sheet
// has six and cannot fill a Trainee Trip (C13), which tests/military.test.mjs covers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseBasis } from "../lib/military.ts";
import {
  EditorialConflict,
  EditorialInvalid,
  EditorialNotFound,
  packagesOf,
  release,
} from "../lib/editorial/store.ts";

const actor = { principal: "firebase:demo-airplane-games:editor-1" };
const roster = Array.from({ length: 10 }, (_, i) => ({
  id: `t-${i + 1}`,
  name: `Aircraft ${i + 1}`,
  rank: "Trainee",
  wrong: [`Wrong ${i + 1}a`, `Wrong ${i + 1}b`, `Wrong ${i + 1}c`],
  file: `T_${i + 1}.jpg`,
  photographer: "Client Photographer",
}));
const photos = () =>
  roster.map((_, i) => ({
    id: `photo-${i + 1}`,
    version: 1,
    status: "approved",
    games: true,
    demo: false,
    bytes: 1000,
    digest: `sha256-${i + 1}`,
  }));
const evidence = (i, overrides = {}) => ({
  photoSource: "submission",
  submissionId: `photo-${i + 1}`,
  licenseUrl: "",
  permission: "Supplied by the client with game rights.",
  attribution: "Client Photographer",
  referenceUrl: "https://example.com/reference",
  answer: "",
  aliases: [],
  distractors: ["x", "y", "z"],
  hint: "",
  reveal: "",
  checklist: { identity: true, answers: true, crop: true, clipperCard: true },
  notes: "",
  ...overrides,
});
const stages = ["rights_checked", "content_prepared", "previewed", "approved"];

async function approveAll(store) {
  for (const [i, a] of roster.entries())
    for (const [v, stage] of stages.entries())
      await store.saveDraft("military", a.id, { baseVersion: v, stage, evidence: evidence(i) }, actor);
}
async function basisOf(store) {
  return releaseBasis(packagesOf((await store.list("military")).items));
}

export function editorialStoreContract(name, makeHarness) {
  const setup = () => makeHarness({ roster, photos: photos() });

  test(`${name}: version 0 creates a package with one audit event`, async () => {
    const h = await setup();
    const item = await h.store.saveDraft(
      "military",
      "t-1",
      { baseVersion: 0, stage: "missing_photo", evidence: evidence(0) },
      actor,
    );
    assert.equal(item.version, 1);
    assert.equal(item.preparation.stage, "missing_photo");
    assert.equal(await h.audits(), 1);
    const listed = (await h.store.list("military")).items;
    assert.equal(listed.length, roster.length);
    assert.equal(listed.find((i) => i.id === "t-2").version, 0);
  });

  test(`${name}: a stale base version conflicts and writes nothing`, async () => {
    const h = await setup();
    const input = { baseVersion: 0, stage: "missing_photo", evidence: evidence(0) };
    await h.store.saveDraft("military", "t-1", input, actor);
    await assert.rejects(h.store.saveDraft("military", "t-1", input, actor), EditorialConflict);
    assert.equal(await h.audits(), 1);
  });

  test(`${name}: unknown questions, fields and stages are refused`, async () => {
    const { store } = await setup();
    await assert.rejects(
      store.saveDraft("military", "mil-a1", { baseVersion: 0, stage: "missing_photo", evidence: evidence(0) }, actor),
      EditorialNotFound,
    );
    await assert.rejects(
      store.saveDraft("military", "t-1", { baseVersion: 0, stage: "missing_photo", evidence: { photoSource: 3 } }, actor),
      EditorialInvalid,
    );
    await assert.rejects(
      store.saveDraft("military", "t-1", { baseVersion: 0, stage: "published", evidence: evidence(0) }, actor),
      /Unknown preparation stage/,
    );
    await assert.rejects(
      store.saveDraft("military", "t-1", { baseVersion: 0, stage: "approved", evidence: evidence(0) }, actor),
      /Move to Rights checked/,
    );
  });

  test(`${name}: question content always comes from the sheet`, async () => {
    const { store } = await setup();
    const item = await store.saveDraft(
      "military",
      "t-3",
      {
        baseVersion: 0,
        stage: "missing_photo",
        evidence: evidence(2, { answer: "Staff answer", distractors: ["a", "b", "c"], hint: "staff hint" }),
      },
      actor,
    );
    assert.equal(item.preparation.evidence.answer, "Aircraft 3");
    assert.deepEqual(item.preparation.evidence.distractors, ["Wrong 3a", "Wrong 3b", "Wrong 3c"]);
    assert.equal(item.preparation.evidence.hint, "");
    assert.equal(item.question.answer, "Aircraft 3");
  });

  test(`${name}: an approved package changes only after stepping back`, async () => {
    const { store } = await setup();
    for (const [v, stage] of stages.entries())
      await store.saveDraft("military", "t-1", { baseVersion: v, stage, evidence: evidence(0) }, actor);
    await assert.rejects(
      store.saveDraft(
        "military",
        "t-1",
        { baseVersion: 4, stage: "approved", evidence: evidence(0, { notes: "changed" }) },
        actor,
      ),
      /Step an approved package back/,
    );
    const back = await store.saveDraft(
      "military",
      "t-1",
      { baseVersion: 4, stage: "previewed", evidence: evidence(0, { notes: "changed" }) },
      actor,
    );
    assert.equal(back.version, 5);
  });

  test(`${name}: a linked contribution must be real and approved for games from Rights checked on`, async () => {
    const h = await setup();
    const save = (photo) =>
      h.store.saveDraft(
        "military",
        "t-1",
        { baseVersion: 0, stage: "rights_checked", evidence: evidence(0, { submissionId: photo }) },
        actor,
      );
    await assert.rejects(save("photo-missing"), EditorialNotFound);
    await h.changePhoto("photo-1", { status: "pending" });
    await assert.rejects(save("photo-1"), /real contribution approved for game use/);
    await h.changePhoto("photo-2", { demo: true });
    await assert.rejects(save("photo-2"), /real contribution approved for game use/);
    await h.changePhoto("photo-3", { games: false });
    await assert.rejects(save("photo-3"), /real contribution approved for game use/);
    assert.equal(await h.audits(), 0);
    // Before Rights checked a pending photograph may be linked.
    await h.store.saveDraft(
      "military",
      "t-1",
      { baseVersion: 0, stage: "missing_photo", evidence: evidence(0) },
      actor,
    );
  });

  test(`${name}: uploads are refused on a stale basis, without review, or with release errors`, async () => {
    const h = await setup();
    await assert.rejects(
      h.store.upload("military", { basis: await basisOf(h.store), previewed: true }, actor),
      (error) => error instanceof EditorialInvalid && error.errors.length > 0,
    );
    await approveAll(h.store);
    const basis = await basisOf(h.store);
    await assert.rejects(h.store.upload("military", { basis: basis + "x", previewed: true }, actor), EditorialConflict);
    await assert.rejects(h.store.upload("military", { basis, previewed: false }, actor), /Review the sample Trips/);
    await h.changePhoto("photo-4", { status: "changes_requested" });
    await assert.rejects(
      h.store.upload("military", { basis, previewed: true }, actor),
      (error) =>
        error instanceof EditorialInvalid &&
        error.errors.some((m) => m.startsWith("Aircraft 4 (Trainee)")),
    );
    assert.equal(await h.audits(), roster.length * stages.length);
  });

  test(`${name}: an upload is a visible candidate; activation makes it live`, async () => {
    const h = await setup();
    await approveAll(h.store);
    const before = await h.audits();
    const basis = await basisOf(h.store);
    const candidate = await h.store.upload("military", { basis, previewed: true }, actor);
    assert.deepEqual(
      { number: candidate.number, status: candidate.status, aircraft: candidate.aircraft },
      { number: 1, status: "uploaded", aircraft: roster.length },
    );
    let { live } = await h.store.list("military");
    assert.equal(live.current, null, "an upload is not live");
    assert.deepEqual(live.releases.map((r) => [r.number, r.status]), [[1, "uploaded"]]);
    live = await h.store.activate("military", { release: 1, liveVersion: 0 }, actor);
    assert.equal(live.current, 1);
    assert.equal(live.version, 1);
    assert.deepEqual(live.releases.map((r) => [r.number, r.status]), [[1, "released"]]);
    assert.equal(await h.audits(), before + 2, "upload and activation each write one audit event");
    await assert.rejects(h.store.upload("military", { basis, previewed: true }, actor), /already the current release/);
    await assert.rejects(
      h.store.activate("military", { release: 1, liveVersion: 1 }, actor),
      /Only an uploaded release can be made live/,
    );
    await assert.rejects(h.store.activate("military", { release: 9, liveVersion: 1 }, actor), EditorialNotFound);
  });

  test(`${name}: a package changed after upload blocks activation and writes nothing`, async () => {
    const h = await setup();
    await approveAll(h.store);
    await h.store.upload("military", { basis: await basisOf(h.store), previewed: true }, actor);
    await h.store.saveDraft("military", "t-2", { baseVersion: 4, stage: "previewed", evidence: evidence(1) }, actor);
    await h.store.saveDraft("military", "t-2", { baseVersion: 5, stage: "approved", evidence: evidence(1) }, actor);
    const before = await h.audits();
    await assert.rejects(h.store.activate("military", { release: 1, liveVersion: 0 }, actor), EditorialConflict);
    assert.equal(await h.audits(), before);
    const { live } = await h.store.list("military");
    assert.equal(live.current, null);
    assert.equal(live.releases[0].status, "uploaded", "the candidate stays visible");
  });

  test(`${name}: a photograph re-reviewed after upload blocks activation`, async () => {
    const h = await setup();
    await approveAll(h.store);
    await h.store.upload("military", { basis: await basisOf(h.store), previewed: true }, actor);
    await h.changePhoto("photo-5", { version: 2 });
    await assert.rejects(h.store.activate("military", { release: 1, liveVersion: 0 }, actor), EditorialConflict);
  });

  test(`${name}: release() uploads and activates; restore steps back through history`, async () => {
    const h = await setup();
    await approveAll(h.store);
    await assert.rejects(
      release(h.store, "military", { basis: await basisOf(h.store), previewed: true, liveVersion: 3 }, actor),
      EditorialConflict,
    );
    await assert.rejects(h.store.restore("military", { liveVersion: 0 }, actor), /no earlier release/);
    let live = await release(
      h.store,
      "military",
      { basis: await basisOf(h.store), previewed: true, liveVersion: 0 },
      actor,
    );
    assert.equal(live.current, 1);
    await h.store.saveDraft("military", "t-1", { baseVersion: 4, stage: "previewed", evidence: evidence(0) }, actor);
    await h.store.saveDraft("military", "t-1", { baseVersion: 5, stage: "approved", evidence: evidence(0) }, actor);
    live = await release(h.store, "military", { basis: await basisOf(h.store), previewed: true, liveVersion: 1 }, actor);
    assert.deepEqual([live.current, live.history, live.version], [2, [1], 2]);
    await assert.rejects(h.store.restore("military", { liveVersion: 1 }, actor), EditorialConflict);
    const before = await h.audits();
    live = await h.store.restore("military", { liveVersion: 2 }, actor);
    assert.deepEqual([live.current, live.history, live.version], [1, [], 3]);
    assert.equal(await h.audits(), before + 1);
    await assert.rejects(h.store.restore("military", { liveVersion: 3 }, actor), /no earlier release/);
  });
}
