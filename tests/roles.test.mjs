import assert from "node:assert/strict";
import { test } from "node:test";
import { BackendError, BackendNotConnected } from "../lib/request/backend.ts";
import { mockRoles, parseEmailList, readOwnRoles, rolesSource } from "../lib/request/roles.ts";

const client = (answer) => ({
  async getJson() {
    if (answer instanceof Error) throw answer;
    return answer;
  },
  async send() {
    throw new Error("not used");
  },
});
const row = { role: "admin", state: "active", revision: 1, requestedAt: "2026-11-01T00:00:00Z", decidedAt: null };

test("readOwnRoles keeps contract answers and turns every backend problem into no role", async () => {
  assert.deepEqual(await readOwnRoles(client({ roles: [row] })), { status: "ok", roles: [row] });
  assert.deepEqual(await readOwnRoles(client({ roles: [{ ...row, extra: 1 }] })), { status: "unavailable" });
  assert.deepEqual(await readOwnRoles(client({ roles: [{ ...row, role: "owner" }] })), { status: "unavailable" });
  assert.deepEqual(await readOwnRoles(client(new BackendNotConnected())), { status: "not-connected" });
  assert.deepEqual(await readOwnRoles(client(new BackendError(429, "rate_limited"))), { status: "unavailable" });
  await assert.rejects(readOwnRoles(client(new TypeError("bug"))), TypeError, "a programming error is not hidden");
});

test("ROLES_SOURCE is mock unless it says backend", () => {
  assert.equal(rolesSource("backend"), "backend");
  assert.equal(rolesSource(" Backend "), "backend");
  for (const value of [undefined, "", "mock", "backend-ish"]) assert.equal(rolesSource(value), "mock");
});

test("mock roles match verified emails only, ignoring case and spaces", () => {
  const lists = { admins: parseEmailList(" Editor@Example.com , "), photographers: parseEmailList("lens@example.com") };
  const roles = (email, emailVerified = true) => mockRoles({ email, emailVerified }, lists);
  assert.deepEqual(roles("editor@example.com").roles.map((r) => [r.role, r.state]), [["admin", "active"]]);
  assert.equal(roles("editor@example.com").source, "mock");
  assert.deepEqual(roles("editor@example.com", false).roles, [], "an unverified email holds nothing");
  assert.deepEqual(roles("LENS@example.com").roles.map((r) => r.role), ["photographer"]);
  assert.deepEqual(roles("someone@example.com").roles, []);
  assert.deepEqual(mockRoles({ email: "", emailVerified: true }, { admins: [""], photographers: [] }).roles, []);
});

test("the role schemas match the vendored openapi contract", async () => {
  const { readFile } = await import("node:fs/promises");
  const roles = await import("../lib/request/roles.ts");
  const yaml = await readFile(new URL("../contracts/openapi.yaml", import.meta.url), "utf8");
  // The schema block under components/schemas: from "    Name:" to the next 4-space key.
  const block = (name) => {
    const start = yaml.indexOf(`\n    ${name}:\n`);
    assert.ok(start >= 0, `${name} is in the contract`);
    const rest = yaml.slice(start + name.length + 7);
    const end = rest.search(/\n {4}[A-Za-z]/);
    return end < 0 ? rest : rest.slice(0, end);
  };
  const list = (text, key) => {
    const found = text.match(new RegExp(String.raw`\n {6}${key}: \[([^\]]*)\]`));
    assert.ok(found, key);
    return found[1].split(",").map((s) => s.trim()).filter(Boolean).sort();
  };
  const keys = (schema) => Object.keys(schema.shape).sort();
  assert.deepEqual(list(block("RoleState"), "enum"), [...roles.roleStates].sort());
  assert.deepEqual(list(block("OwnRole"), "required"), keys(roles.ownRoleSchema));
  assert.deepEqual(list(block("AdminRoleRow"), "required"), keys(roles.adminRoleRowSchema));
  assert.deepEqual(list(block("RoleRequestList"), "required"), keys(roles.roleRequestListSchema));
  assert.deepEqual(list(block("PhotographerRequestResult"), "required"), keys(roles.photographerRequestResultSchema));
  for (const action of Object.keys(roles.roleActions))
    for (const role of roles.roleActions[action])
      if (action !== "revoke")
        assert.ok(yaml.includes(`/v1/admin/accounts/{principal}/roles/${role}/${action}:`), `${role} ${action} exists`);
  assert.ok(yaml.includes("/v1/admin/accounts/{principal}/roles/{role}/revoke:"));
  assert.ok(yaml.includes("/v1/admin/accounts/{principal}/roles/admin/email:"));
});
