import test from "node:test";
import assert from "node:assert/strict";

async function load(basePath) {
  if (basePath === undefined) delete process.env.__NEXT_ROUTER_BASEPATH;
  else process.env.__NEXT_ROUTER_BASEPATH = basePath;
  return import(`../lib/paths.ts?base=${encodeURIComponent(basePath ?? "")}`);
}

test("at the root, paths pass through unchanged", async () => {
  const { sitePath, appPath } = await load(undefined);
  assert.equal(sitePath("/admin"), "/admin");
  assert.equal(sitePath("/"), "/");
  assert.equal(appPath("/admin"), "/admin");
});

test("under a base path, app paths gain the prefix exactly once", async () => {
  const { BASE_PATH, sitePath, appPath } = await load("/arcade/");
  assert.equal(BASE_PATH, "/arcade");
  assert.equal(
    sitePath("/admin/sign-in?return_to=%2Fadmin"),
    "/arcade/admin/sign-in?return_to=%2Fadmin",
  );
  assert.equal(sitePath("/"), "/arcade");
  assert.equal(sitePath("/media/a.jpg"), "/arcade/media/a.jpg");
  assert.equal(sitePath("/arcadeX"), "/arcade/arcadeX");
  assert.equal(appPath("/arcade/contribute"), "/contribute");
  assert.equal(appPath("/arcade"), "/");
});

test("an area name used as the base path still prefixes that area's routes", async () => {
  for (const basePath of ["/admin", "/contribute", "/play"]) {
    const { sitePath, appPath } = await load(basePath);
    assert.equal(sitePath(basePath), `${basePath}${basePath}`);
    assert.equal(
      sitePath(`${basePath}/sign-in`),
      `${basePath}${basePath}/sign-in`,
    );
    const destination = `${basePath}?view=mine#details`;
    assert.equal(sitePath(destination), `${basePath}${destination}`);
    assert.equal(appPath(sitePath(destination)), destination);
  }
});

test("external, protocol-relative, hash and blob URLs are left alone", async () => {
  const { sitePath } = await load("/arcade");
  for (const url of [
    "https://example.com/a",
    "//cdn.example/a",
    "#main",
    "mailto:x@y.z",
    "blob:abc",
  ])
    assert.equal(sitePath(url), url);
});
