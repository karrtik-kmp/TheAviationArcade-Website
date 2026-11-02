import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { httpProgressSource } from "../lib/progress/http.ts";
import { mockProgressSource, sampleProgress } from "../lib/progress/mock.ts";
import { progressEnvelopeSchema, progressSchema, rankName } from "../lib/progress/source.ts";
import { backendClient } from "../lib/request/backend.ts";
import { Bearer } from "../lib/request/principal.ts";

const example = JSON.parse(readFileSync(new URL("../contracts/backend-progress.example.json", import.meta.url), "utf8"));
const member = { kind: "member", userId: "firebase:demo-airplane-games:pilot", bearer: new Bearer("tok") };
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const error = (status, code, headers) => json(status, { error: { code, message: code, requestId: "r" } }, headers);
const over = (reply, baseUrl = "http://127.0.0.1:3000") =>
  httpProgressSource((bearer) => backendClient({ baseUrl, fetch: async () => reply() }, bearer));

test("the example response and the sample both match the backend's Progress contract", () => {
  assert.ok(progressEnvelopeSchema.safeParse(example).success);
  for (const id of ["a", "b", "c", "firebase:demo-airplane-games:pilot"])
    assert.ok(progressSchema.safeParse(sampleProgress(id)).success, id);
  assert.deepEqual(sampleProgress("a"), sampleProgress("a"), "deterministic per account");
});

test("the contract is strict: an unknown or missing field is refused", () => {
  assert.equal(progressSchema.safeParse({ ...example.progress, callsign: "X" }).success, false);
  const { version: _v, ...noVersion } = example.progress;
  assert.equal(progressSchema.safeParse(noVersion).success, false, "version is required (D-1)");
  assert.equal(progressSchema.safeParse({ ...example.progress, activeRank: "student-pilot" }).success, false);
});

test("each backend answer maps to one page state", async () => {
  const table = [
    [() => json(200, example), { kind: "progress", progress: example.progress }],
    [() => error(404, "player_not_found"), { kind: "no-player" }],
    [() => error(401, "unauthorized"), { kind: "signed-out" }],
    [() => error(429, "rate_limited", { "Retry-After": "30" }), { kind: "unavailable", retryAfter: 30 }],
    [() => error(503, "service_unavailable", { "Retry-After": "5" }), { kind: "unavailable", retryAfter: 5 }],
    [() => error(426, "client_update_required"), { kind: "unavailable" }],
    [() => json(200, { progress: { ...example.progress, extra: 1 } }), { kind: "unavailable" }],
    [() => { throw new TypeError("fetch failed"); }, { kind: "unavailable" }],
  ];
  for (const [reply, expected] of table) assert.deepEqual(await over(reply).read(member), expected);
  assert.deepEqual(await over(() => json(200, example), "").read(member), { kind: "not-connected" });
});

test("the sample source is labelled as a sample", async () => {
  const state = await mockProgressSource.read(member);
  assert.equal(state.kind, "progress");
  assert.equal(state.sample, true);
});

test("rank ids display with the game's ladder names", () => {
  assert.deepEqual(
    ["trainee", "first-officer", "captain", "check-airman", "chief-pilot"].map(rankName),
    ["Trainee", "First Officer", "Captain", "Check Airman", "Chief Pilot"],
  );
});
