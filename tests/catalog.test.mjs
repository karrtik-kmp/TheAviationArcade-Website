// The website catalog against the vendored backend contract (contracts/catalog.v1.json).
import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "../contracts/catalog.v1.json" with { type: "json" };
import { games } from "../lib/catalog.ts";
import { gameSlugs } from "../lib/rules.ts";

test("the vendored file is catalog.v1", () => {
  assert.equal(catalog.format, "catalog.v1");
});

test("every game's backendId is a catalog module id, and every module has a game", () => {
  const ids = games.map((g) => g.backendId);
  assert.equal(new Set(ids).size, ids.length, "no module id is used twice");
  assert.deepEqual(new Set(ids), new Set(catalog.modules.map((m) => m.id)));
});

test("games are listed in the catalog's ticket order", () => {
  const order = [...catalog.modules].sort((a, b) => a.ticket - b.ticket).map((m) => m.id);
  assert.deepEqual(games.map((g) => g.backendId), order);
});

test("Military keeps its website slug and uses the decided module id", () => {
  const military = games.find((g) => g.backendId === "aircraft-identifier-military");
  assert.equal(military.slug, "military-aircraft-identifier");
});

test("URL slugs are unique and the submission form accepts exactly them", () => {
  const slugs = games.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(new Set(gameSlugs.options), new Set(slugs));
});

test("the website's rank ladder is the catalog's, in order, with its thresholds", async () => {
  const { ranks, rankNames } = await import("../lib/catalog.ts");
  assert.deepEqual(
    ranks.map((r) => [r.id, r.name, r.statusPoints]),
    catalog.ranks.map((r) => [r.id, r.name, r.statusPoints]),
  );
  assert.deepEqual([...rankNames], catalog.ranks.map((r) => r.name));
  const { militaryRankNames } = await import("../lib/military.ts");
  const { rankIds } = await import("../lib/progress/source.ts");
  assert.deepEqual([...militaryRankNames], [...rankNames], "Military uses the same ladder");
  assert.deepEqual([...rankIds], catalog.ranks.map((r) => r.id), "progress ranks are the catalog ids");
});
