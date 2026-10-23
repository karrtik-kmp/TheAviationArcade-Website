import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { initialDemoState, parseDemoState, demoStorageKey } from "../lib/demo-model.ts";
import { matchesDemoPrincipal } from "../lib/demo-policy.ts";
const snapshot = JSON.parse(await readFile(new URL("../data/demo-game-content.json", import.meta.url), "utf8"));

test("imported defaults preserve the current game contract and Military gate", () => {
  assert.equal(snapshot.demoOnly, true);
  assert.equal(snapshot.hints.StarterHints, 5);
  assert.equal(snapshot.hints.FlightsPerTrip, 10);
  assert.equal(snapshot.defaults.monetization, false);
  assert.equal(snapshot.defaults.dailyReset, "Player local midnight");
  assert.equal(snapshot.thresholds.at(-1).statusPoints, 400000);
  assert.equal(snapshot.modules.find((row) => row.id === "AircraftIdentifierMilitary").status, "Coming Soon");
  assert.ok(snapshot.provenance.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)));
});
test("demo data restores settings and rejects corrupt or unsupported stored state", () => {
  const defaults = initialDemoState(snapshot.potd[0]);
  assert.equal(defaults.livery, "Chartroom");
  assert.equal(defaults.untimedMode, false);
  assert.deepEqual(parseDemoState(JSON.parse(JSON.stringify(defaults))), defaults);
  for (const patch of [{ version: 2 }, { sound: "yes" }, { livery: "Other" }, { reviews: ["Approved sample"] }, { potdDescription: "" }, { siteTitle: "x".repeat(81) }])
    assert.equal(parseDemoState({ ...defaults, ...patch }), null);
  const saved = parseDemoState({ ...defaults, isStaff: true, miles: 999999 });
  assert.equal(saved.isStaff, undefined);
  assert.equal(saved.miles, undefined);
  assert.notEqual(demoStorageKey("account-a"), demoStorageKey("account-b"));
});
test("only the exact configured namespaced demo UID removes live capabilities", () => {
  assert.equal(matchesDemoPrincipal("firebase:project:demo", "project", "demo"), true);
  for (const user of ["firebase:other:demo", "firebase:project:staff", "demo", undefined])
    assert.equal(matchesDemoPrincipal(user, "project", "demo"), false);
  assert.equal(matchesDemoPrincipal("firebase:project:demo", "project", undefined), false);
});
