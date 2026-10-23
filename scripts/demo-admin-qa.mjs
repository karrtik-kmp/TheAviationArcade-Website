import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5173";
const local = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
if (!local && origin !== "https://aviation-arcade-website.karrtik-kmphitech.workers.dev")
  throw new Error("Hosted demo QA is restricted to the approved preview origin.");
const demoEmail = local ? "demo-pilot@sites.test" : "demo@airplane-games.test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);
const checks = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = local ? "docs/evidence/demo-admin" : "docs/evidence/hosted-demo-admin";
await mkdir(output, { recursive: true });
async function check(name, run) { await run(); checks.push({ name, passed: true }); console.log("PASS " + name); }
async function section(name) { await page.locator(".admin-nav").getByRole("button", { name, exact: true }).click(); }
async function overflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
try {
  await check("removed demo workspace route is gone", async () => {
    const response = await page.goto(origin + "/demo", { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 404);
  });
  await check("prefilled demo login opens the read-only admin", async () => {
    await page.goto(origin + "/sign-in?return_to=%2Fadmin", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Fill demo login", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Email address", exact: true }).inputValue(), demoEmail);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Demo preview", exact: true }).waitFor();
    const nav = await page.locator(".admin-nav button").allTextContents();
    assert.deepEqual(nav.map((label) => label.trim()), ["Overview", "Aircraft Identifier", "Plane of the Day"]);
    for (const name of ["Load demo data", "Review submissions"])
      assert.equal(await page.getByRole("button", { name }).count(), 0, name);
  });
  await check("previous sample drafts are viewable but not editable", async () => {
    const writes = [];
    const onRequest = (request) => { if (request.url().startsWith(origin + "/api/") && request.method() !== "GET" && !request.url().includes("/auth/")) writes.push(request.url()); };
    page.on("request", onRequest);
    for (const [desk, title] of [["Aircraft Identifier", "Identify this aircraft [Demo]"], ["Plane of the Day", "Threshold Geometry [Demo]"]]) {
      await section(desk);
      assert.equal(await page.getByRole("button", { name: "Load sample content" }).count(), 0);
      await page.locator(".admin-record").filter({ hasText: title }).click();
      await page.getByRole("heading", { name: "View content", exact: true }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Editorial title" }).inputValue(), title);
      assert.equal(await page.getByRole("textbox", { name: "Editorial title" }).isDisabled(), true);
      for (const name of ["Save draft", "Mark prototype-ready", "Schedule feature", "Publish for today", "Archive"])
        assert.equal(await page.getByRole("button", { name }).count(), 0, name);
    }
    assert.deepEqual(writes, []);
    page.off("request", onRequest);
  });
  await check("shared demo account cannot read or mutate live contributor and editorial data", async () => {
    const account = await (await context.request.get(origin + "/api/account")).json();
    assert.equal(account.isStaff, false);
    assert.ok(account.user);
    for (const [path, method] of [["/api/submissions", "GET"], ["/api/submissions", "POST"], ["/api/admin/submissions", "GET"], ["/api/admin/content", "GET"], ["/api/admin/demo", "POST"]]) {
      const response = await context.request.fetch(origin + path, { method, headers: { Origin: origin } });
      assert.equal(response.status(), 403, method + " " + path);
    }
    await page.goto(origin + "/contribute", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/admin", { waitUntil: "domcontentloaded" });
  });
  await check("all desks fit phones and desktop in both themes", async () => {
    await page.getByRole("heading", { name: "Demo preview", exact: true }).waitFor();
    for (const theme of ["light", "dark"]) {
      const label = theme === "dark" ? "Use dark theme" : "Use light theme";
      if (await page.getByRole("button", { name: label, exact: true }).count()) await page.getByRole("button", { name: label, exact: true }).click();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const name of ["Overview", "Aircraft Identifier", "Plane of the Day"]) { await section(name); await overflow(); }
        await page.locator(".admin-record").first().click(); await overflow();
        if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/${width}-${theme}.png`, fullPage: true });
      }
    }
  });
  await check("sign-out clears demo access", async () => {
    await page.goto(origin + "/sign-out", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/account", { waitUntil: "domcontentloaded" });
    const account = await (await context.request.get(origin + "/api/account")).json();
    assert.equal(account.user, null); assert.equal(account.isStaff, false);
    assert.equal((await context.request.get(origin + "/api/admin/submissions")).status(), 401);
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/qa.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin,
    scope: local ? "Local emulator; read-only demo admin" : "Approved hosted Firebase demo; read-only demo admin and API denial probes",
    checks, pageErrors: errors }, null, 2) + "\n");
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ url: page.url(), alerts: await page.getByRole("alert").allTextContents(), pageErrors: errors }));
  throw error;
} finally { await browser.close(); }
