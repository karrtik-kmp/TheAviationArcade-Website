import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { demoPassword } from "./seed-auth-emulator.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90000);
const checks = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = "docs/evidence/demo-workspace";
await mkdir(output, { recursive: true });
async function check(name, run) { await run(); checks.push({ name, passed: true }); console.log("PASS " + name); }
async function section(name) { await page.getByRole("button", { name, exact: true }).click(); }
async function overflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
try {
  await check("anonymous demo requires Firebase sign-in", async () => {
    await page.goto(origin + "/demo", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Sign in to demo", exact: true }).waitFor();
  });
  await check("existing Firebase login opens prefilled demo", async () => {
    await page.goto(origin + "/sign-in?return_to=%2Fdemo", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Fill demo login", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Email address", exact: true }).inputValue(), "demo-pilot@sites.test");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/demo", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Demo workspace", exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Hangar livery" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Hangar livery" }).inputValue(), "Chartroom");
    assert.equal(await page.getByRole("checkbox", { name: "Sound effects" }).isChecked(), true);
    assert.equal(await page.getByRole("checkbox", { name: "Reduced motion" }).isChecked(), false);
  });
  await check("settings save, reload and reset", async () => {
    await page.getByRole("combobox", { name: "Hangar livery" }).selectOption("Pacific");
    await page.getByRole("combobox", { name: "Service scenario" }).selectOption("Flight Delayed");
    await page.getByRole("checkbox", { name: "Reduced motion" }).check();
    await page.getByRole("button", { name: "Save demo changes" }).click();
    await page.getByText("Demo changes saved in this browser.", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Reset demo" }).waitFor();
    await page.waitForFunction(() => document.querySelector('select')?.value === "Pacific");
    assert.equal(await page.getByRole("checkbox", { name: "Reduced motion" }).isChecked(), true);
    await page.getByRole("heading", { name: "Flight Delayed", exact: true }).waitFor();
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Hangar livery" }).inputValue(), "Chartroom");
  });
  await check("shared demo account cannot read or mutate live contributor and editorial data", async () => {
    for (const [path, method] of [["/api/submissions", "GET"], ["/api/submissions", "POST"], ["/api/admin/submissions", "GET"], ["/api/admin/demo", "POST"]]) {
      const response = await context.request.fetch(origin + path, { method, headers: { Origin: origin } });
      assert.equal(response.status(), 403, method + " " + path);
    }
  });
  await check("imported catalog, source review state and question filters", async () => {
    await section("Games & content");
    await page.getByText("AIRPLANE IDENTIFIER - MILITARY", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Search questions" }).fill("ai-a1");
    assert.ok(await page.locator(".demo-question-list li").count());
    await page.getByRole("textbox", { name: "Search questions" }).fill("no-such-plane");
    await page.getByText("No questions match these filters.").waitFor();
    await page.getByRole("textbox", { name: "Search questions" }).fill("");
    assert.equal(await page.locator(".demo-question-list li").count(), 31);
  });
  await check("daily feature and review drafts persist without network writes", async () => {
    const writes = [];
    const onRequest = (request) => { if (request.url().startsWith(origin + "/api/") && request.method() !== "GET" && !request.url().includes("/auth/")) writes.push(request.url()); };
    page.on("request", onRequest);
    await section("Plane of the Day");
    await page.getByRole("textbox", { name: "Feature title", exact: true }).fill("Demo daily feature");
    await section("Submissions");
    await page.getByRole("combobox", { name: "Review state — sample 1" }).selectOption("Needs changes");
    await page.getByRole("button", { name: "Save demo changes" }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await section("Plane of the Day");
    assert.equal(await page.getByRole("textbox", { name: "Feature title", exact: true }).inputValue(), "Demo daily feature");
    await section("Submissions");
    assert.equal(await page.getByRole("combobox", { name: "Review state — sample 1" }).inputValue(), "Needs changes");
    assert.deepEqual(writes, []);
    page.off("request", onRequest);
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  });
  await check("all sections fit phones and desktop in both themes", async () => {
    for (const theme of ["light", "dark"]) {
      const label = theme === "dark" ? "Use dark theme" : "Use light theme";
      if (await page.getByRole("button", { name: label, exact: true }).count()) await page.getByRole("button", { name: label, exact: true }).click();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const name of ["General settings", "Games & content", "Plane of the Day", "Submissions", "Website & services"]) { await section(name); await overflow(); }
        await section("General settings");
        if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/${width}-${theme}.png`, fullPage: true });
      }
    }
  });
  await check("separate authenticated accounts get isolated browser drafts", async () => {
    await page.getByRole("combobox", { name: "Hangar livery" }).selectOption("Continental");
    await page.getByRole("button", { name: "Save demo changes" }).click();
    await page.goto(origin + "/sign-out");
    await page.waitForURL((url) => url.pathname === "/account");
    await page.goto(origin + "/sign-in?return_to=%2Fdemo");
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill("photographer-a@sites.test");
    await page.getByLabel("Password", { exact: true }).fill(demoPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/demo");
    await page.getByRole("button", { name: "Reset demo", exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Hangar livery" }).inputValue(), "Chartroom");
  });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/qa.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin, scope: "Local emulator and browser-only demo; hosted demo account not provisioned", checks, pageErrors: errors }, null, 2) + "\n");
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ url: page.url(), alerts: await page.getByRole("alert").allTextContents(), pageErrors: errors }));
  throw error;
} finally { await browser.close(); }
