import assert from "node:assert/strict";
import { test } from "node:test";
import { adminWorkspaceUrl } from "../lib/admin-site.ts";

test("the Admin is derived from the website host: apex and www → admin., dev. → dev.admin.", () => {
  assert.equal(adminWorkspaceUrl("playairplanegames.com"), "https://admin.playairplanegames.com/admin");
  assert.equal(adminWorkspaceUrl("www.playairplanegames.com"), "https://admin.playairplanegames.com/admin");
  assert.equal(adminWorkspaceUrl("dev.playairplanegames.com"), "https://dev.admin.playairplanegames.com/admin");
  assert.equal(adminWorkspaceUrl("Dev.PlayAirplaneGames.com:443"), "https://dev.admin.playairplanegames.com/admin");
});

test("local, preview and admin hosts have no known Admin, so the link is left out", () => {
  for (const host of [null, undefined, "", "localhost", "localhost:5173", "127.0.0.1:5173", "site.test", "app.localhost",
    "admin.playairplanegames.com", "dev.admin.playairplanegames.com", "evil.example/path", "a b.com"])
    assert.equal(adminWorkspaceUrl(host), null, String(host));
});
