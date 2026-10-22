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
let createdId, featureId;
const proposalTitle = "Local QA photograph " + Date.now();
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
    "Seven-game catalog, category filters, search and detail",
    async () => {
      await page.goto(origin + "/games", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
      assert.equal(await page.locator(".game-card").count(), 7);
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
      assert.equal(await page.locator(".game-card").count(), 7);
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
      .getByRole("heading", { name: "Seven games. One aviation obsession." })
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
    "Photographer form uploads a proposal with private metadata",
    async () => {
      await page.goto(origin + "/contribute?game=aircraft-identifier", {
        waitUntil: "domcontentloaded",
      });
      await page
        .locator("#field-photo")
        .setInputFiles("public/media/aircraft.jpg");
      await page.locator("#field-title").fill(proposalTitle);
      await page
        .locator("#field-description")
        .fill(
          "Local-only automated workflow fixture using the client preview photograph. Not a production rights grant.",
        );
      await page.locator("#field-aircraft").fill("Boeing 767-200");
      await page.locator("#field-location").fill("Local QA fixture");
      await page.locator("#field-credit").fill("Josh M (local QA fixture)");
      await page
        .locator("#field-factualSource")
        .fill("https://www.boeing.com/commercial/767/");
      await page
        .locator("#field-rightsEvidence")
        .fill(
          "Local-only workflow verification. This is not evidence for public use.",
        );
      for (const label of [
        "Game content",
        "Website & gallery",
        "Plane of the Day",
      ])
        await page.getByRole("checkbox", { name: label, exact: true }).check();
      await page.locator("#field-consent").check();
      await page.screenshot({
        path: "docs/evidence/contributor-form-dark.png",
        fullPage: true,
      });
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === "/api/submissions" &&
            r.request().method() === "POST",
        ),
        page
          .getByRole("button", { name: "Send for private review", exact: true })
          .click(),
      ]);
      const body = await response.json();
      assert.equal(response.status(), 201, JSON.stringify(body));
      createdId = body.submission.id;
      assert.equal(body.submission.status, "pending");
    },
  );
  await check(
    "Review requires checks, supports changes, revision, and approval",
    async () => {
      await page.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Good to have you back." })
        .waitFor();
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("button", { name: /^Submissions/ })
        .click();
      await page.locator("tr").filter({ hasText: proposalTitle }).click();
      await page
        .getByRole("button", { name: "Approve submission", exact: true })
        .click();
      await page
        .getByText("Complete all five verification checks before approval.")
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
      let owned = (await api("/api/submissions")).body.submissions.find(
        (s) => s.id === createdId,
      );
      assert.equal(owned.status, "changes_requested");
      // Exercise the real revision endpoint with the owning browser session, preserving its photo.
      const revision = await context.request.put(
        origin + `/api/submissions/${createdId}`,
        {
          headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
          multipart: {
            data: JSON.stringify({
              ...owned.data,
              location: "London Heathrow (local QA only)",
            }),
            version: String(owned.version),
          },
        },
      );
      assert.equal(revision.status(), 200, await revision.text());
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Good to have you back." })
        .waitFor();
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("button", { name: /^Submissions/ })
        .click();
      await page.locator("tr").filter({ hasText: proposalTitle }).click();
      for (const label of [
        "Aircraft identity is supported",
        "Photo quality is suitable",
        "Photographer credit is correct",
        "Usage rights are documented",
        "Submission category is accurate",
      ])
        await page.getByRole("checkbox", { name: label, exact: true }).check();
      await page
        .getByRole("button", { name: "Approve submission", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Use for Plane of the Day", exact: true })
        .waitFor();
      await page.screenshot({
        path: "docs/evidence/admin-approved-review-dark.png",
        fullPage: true,
      });
      owned = (await api("/api/submissions")).body.submissions.find(
        (s) => s.id === createdId,
      );
      assert.equal(owned.status, "approved");
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
    "POTD draft, schedule, local-day visibility, private fields and archive",
    async () => {
      await page
        .getByRole("button", { name: "Use for Plane of the Day", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Edit content", exact: true })
        .waitFor();
      let record = (await api("/api/admin/content")).body.records.find(
        (r) => r.sourceId === createdId && r.kind === "potd",
      );
      assert.ok(record);
      featureId = record.id;
      await page
        .getByRole("button", { name: "Publish for today", exact: true })
        .click();
      await page
        .getByText(/saved|published|scheduled/i)
        .first()
        .waitFor();
      const current = await api("/api/featured?timeZone=Asia%2FKolkata");
      assert.equal(current.status, 200);
      assert.equal(current.body.featured.id, featureId);
      assert.equal("email" in current.body.featured, false);
      assert.equal("rightsEvidence" in current.body.featured, false);
      assert.equal(
        (
          await context.request.get(origin + current.body.featured.imageUrl)
        ).status(),
        200,
      );
      record = (await api("/api/admin/content")).body.records.find(
        (r) => r.id === featureId,
      );
      const tomorrow = new Date(Date.now() + 2 * 86400000)
        .toISOString()
        .slice(0, 10);
      assert.equal(
        (
          await api(`/api/admin/content/${featureId}`, "PUT", {
            data: record.data,
            version: record.version,
            status: "scheduled",
            dateKey: tomorrow,
          })
        ).status,
        200,
      );
      assert.equal(
        (await api("/api/featured?timeZone=Asia%2FKolkata")).body.archive.some(
          (p) => p.id === featureId,
        ),
        false,
      );
      record = (await api("/api/admin/content")).body.records.find(
        (r) => r.id === featureId,
      );
      assert.equal(
        (
          await api(`/api/admin/content/${featureId}`, "PUT", {
            data: record.data,
            version: record.version,
            status: "archived",
            dateKey: record.dateKey,
          })
        ).status,
        200,
      );
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
