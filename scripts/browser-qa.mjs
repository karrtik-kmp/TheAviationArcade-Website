import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { signInQaEditor } from "./seed-auth-emulator.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const page = await context.newPage();
const pageErrors = [],
  results = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await mkdir("docs/evidence", { recursive: true });
async function check(name, run) {
  await run();
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
async function api(path, method = "GET", data) {
  const response = await context.request.fetch(origin + path, {
    method,
    headers: method === "GET" ? {} : { Origin: origin },
    ...(data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json() };
}
const overflows = () =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
try {
  await check("Homepage desktop and theme switch", async () => {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page
      .getByRole("heading", { name: "Think you know airplanes?" })
      .waitFor();
    await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "docs/evidence/home-desktop-light.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    await page.screenshot({
      path: "docs/evidence/home-desktop-dark.png",
      fullPage: true,
    });
  });
  await check(
    "Eight-game catalog, category filters, search and detail",
    async () => {
      await page.goto(origin + "/games", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
      assert.equal(await page.locator(".game-card").count(), 8);
      await page.getByRole("button", { name: "Matching", exact: true }).click();
      assert.equal(await page.locator(".game-card").count(), 2);
      await page
        .getByRole("button", { name: "Word games", exact: true })
        .click();
      assert.equal(await page.locator(".game-card").count(), 1);
      await page
        .getByRole("button", { name: "All games", exact: true })
        .click();
      await page.getByRole("textbox", { name: "Search games" }).fill("zzzz");
      await page.getByRole("heading", { name: "No matching games" }).waitFor();
      await page.getByRole("button", { name: "Clear filters" }).click();
      assert.equal(await page.locator(".game-card").count(), 8);
      await page.screenshot({
        path: "docs/evidence/catalog-desktop-dark.png",
        fullPage: true,
      });
      await page.locator('a[href="/games/atc-match"]').click();
      await page
        .getByRole("heading", { name: "ATC Match", exact: true })
        .waitFor();
    },
  );
  await check("Mobile navigation and layout", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Games", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Eight games. One aviation obsession." })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "docs/evidence/catalog-mobile-dark.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check(
    "The website has no admin pages or API, and the local editor signs in as a member",
    async () => {
      // The Admin is its own repo and host (decision I-1): /admin and /api/admin/* are plain 404s here.
      assert.equal((await api("/api/admin/submissions")).status, 404);
      assert.equal((await page.goto(origin + "/admin")).status(), 404);
      await page
        .getByRole("heading", { name: "This destination is unavailable." })
        .waitFor();
      assert.equal((await api("/api/submissions")).status, 401);
      await signInQaEditor(page, origin);
      await page.getByRole("heading", { name: "My account" }).waitFor({ timeout: 60000 });
      const account = await api("/api/account");
      assert.equal(account.body.isStaff, true, "the mock role list makes the QA editor staff");
      // A loopback host has no known Admin, so no editors' link is drawn even for staff.
      assert.equal(await page.getByRole("link", { name: /workspace|Open editor/i }).count(), 0);
      assert.equal((await api("/api/admin/submissions")).status, 404, "staff get no admin API here either");
      await page.screenshot({
        path: "docs/evidence/account-staff-dark.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Member submission routes are closed and /contribute shows the closed panel",
    async () => {
      for (const [path, method] of [
        ["/api/submissions", "GET"],
        ["/api/submissions", "POST"],
        ["/api/submissions/demo-submission-aircraft", "PUT"],
      ]) {
        const closed = await api(path, method, method === "GET" ? undefined : {});
        assert.equal(closed.status, 404, method + " " + path);
        assert.equal(closed.body.code, "SUBMISSIONS_CLOSED", method + " " + path);
      }
      // Query params are ignored; there is no form to fill in any more.
      await page.goto(origin + "/contribute?game=aircraft-identifier", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("heading", { name: "Photo submissions aren't open yet" })
        .waitFor();
      assert.equal(await page.locator("#field-photo").count(), 0);
      await page.screenshot({
        path: "docs/evidence/contributor-closed-dark.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Account page shows the Photo area card instead of My submissions",
    async () => {
      await page.goto(origin + "/account", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Photo area", exact: true }).waitFor();
      await page.getByRole("link", { name: "Open the photo area", exact: true }).waitFor();
      assert.equal(
        await page.getByRole("heading", { name: "My submissions", exact: true }).count(),
        0,
      );
    },
  );
  await check(
    "A member write under another account's session key is fenced, and a cross-site write refused",
    async () => {
      // The account fence runs before the handler, so it answers even on the closed submission route.
      const fenced = await context.request.post(origin + "/api/submissions", {
        headers: { Origin: origin, "X-Account-Session": "another-account-session" },
        data: {},
      });
      assert.equal(fenced.status(), 409);
      assert.equal((await fenced.json()).code, "ACCOUNT_CHANGED");
      const crossSite = await context.request.post(origin + "/api/submissions", {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      });
      assert.equal(crossSite.status(), 403);
    },
  );
  await check(
    "Mobile account page fits the viewport",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + "/account", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Photo area", exact: true }).waitFor();
      assert.equal(await overflows(), false);
      await page.screenshot({
        path: "docs/evidence/account-mobile-dark.png",
        fullPage: true,
      });
    },
  );
  assert.deepEqual(pageErrors, []);
  await writeFile(
    "docs/evidence/browser-qa.json",
    JSON.stringify(
      { origin, checkedAt: new Date().toISOString(), results, pageErrors },
      null,
      2,
    ) + "\n",
  );
  console.log("Browser checks passed: " + results.length);
} catch (error) {
  await page
    .screenshot({ path: "docs/evidence/browser-failure.png", fullPage: true })
    .catch(() => {});
  await writeFile(
    "docs/evidence/browser-qa.json",
    JSON.stringify({ results, pageErrors, failure: String(error) }, null, 2) +
      "\n",
  );
  throw error;
} finally {
  await browser.close();
}
