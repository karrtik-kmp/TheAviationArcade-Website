import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { signInDemoEditor } from "./seed-auth-emulator.mjs";
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
let createdId;
const demoTitle = "KLM on approach [Demo]";
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
    "Anonymous API is denied and local demo staff can sign in",
    async () => {
      assert.equal((await api("/api/admin/submissions")).status, 401);
      await signInDemoEditor(page, origin);
      await page
        .getByRole("heading", { name: "Good to have you back." })
        .waitFor({ timeout: 60000 });
      await page
        .getByRole("button", { name: "Load demo data", exact: true })
        .click();
      await page
        .getByText("Demo records loaded; these cannot be published.")
        .waitFor();
      await page.screenshot({
        path: "docs/evidence/admin-overview-dark.png",
        fullPage: true,
      });
      const demo = await api("/api/admin/submissions");
      assert.equal(demo.status, 200);
      assert.ok(
        demo.body.submissions.some((s) => s.id === "demo-submission-aircraft"),
      );
      assert.equal(
        (
          await context.request.post(origin + "/api/admin/demo", {
            headers: { Origin: "https://untrusted.example" },
          })
        ).status(),
        403,
      );
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
    "Staff review of a seeded demo proposal: checks, changes, stale version",
    async () => {
      // Member proposals can no longer be created on the website (D-2), so review the proposal
      // that POST /api/admin/demo seeds. Demo proposals can never be approved or published.
      createdId = "demo-submission-aircraft";
      await page.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Good to have you back." })
        .waitFor();
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("button", { name: /^Submissions/ })
        .click();
      await page.locator("tr").filter({ hasText: demoTitle }).click();
      await page
        .getByRole("button", { name: "Approve submission", exact: true })
        .click();
      // The seeded demo proposal has no rights evidence, so approval stops at that rule first.
      await page
        .getByText("Record permission or license evidence before approval.")
        .waitFor();
      await page
        .locator(".review-form textarea")
        .fill("Please add a more precise location for this local test.");
      const [changeResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url() === `${origin}/api/admin/submissions/${createdId}` &&
            response.request().method() === "PATCH",
        ),
        page
          .getByRole("button", { name: "Request changes", exact: true })
          .click(),
      ]);
      assert.equal(changeResponse.status(), 200, await changeResponse.text());
      const owned = (await api("/api/admin/submissions")).body.submissions.find(
        (s) => s.id === createdId,
      );
      assert.equal(owned.status, "changes_requested");
      // Approval is refused server-side: the demo proposal has no rights evidence or source.
      const approve = await api(`/api/admin/submissions/${createdId}`, "PATCH", {
        status: "approved",
        note: "",
        checks: {
          identity: true,
          quality: true,
          credit: true,
          rights: true,
          category: true,
        },
        version: owned.version,
      });
      assert.equal(approve.status, 422);
      const stale = await api(`/api/admin/submissions/${createdId}`, "PATCH", {
        status: "rejected",
        note: "Stale revision should be refused.",
        checks: owned.checks,
        version: owned.version - 1,
      });
      assert.equal(stale.status, 409);
    },
  );
  await check(
    "Mobile admin fits viewport and has a usable review list",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Good to have you back." })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: "docs/evidence/admin-mobile-dark.png",
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
