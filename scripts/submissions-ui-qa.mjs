import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { signInDemoEditor } from "./seed-auth-emulator.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = "http://127.0.0.1:5173";
const evidence = "docs/evidence/submissions-ui";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
const page = await context.newPage();
const errors = [], failures = [], results = [];
let listRequests = 0, navigations = 0, accountChecks = 0, delayList = false, delayAccount = false, denyAccount = false;
let submissions = [], malformedAccount = false, accountBarrier = null;
page.on("pageerror", error => errors.push(error.message));
page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
await page.route(`${origin}/api/submissions`, async route => {
  if (route.request().method() !== "GET") return route.continue();
  listRequests++;
  if (delayList) await new Promise(resolve => setTimeout(resolve, 800));
  await route.fulfill({ json: { submissions } });
});
await page.route(`${origin}/api/account`, async route => {
  accountChecks++;
  if (delayAccount) await new Promise(resolve => setTimeout(resolve, 800));
  if (accountBarrier) await accountBarrier;
  if (malformedAccount) return route.fulfill({ json: { user: { displayName: "Invalid fixture" } } });
  if (denyAccount) return route.fulfill({ json: { user: null, isStaff: false, sessionKey: null } });
  await route.continue();
});
async function check(name, run) {
  try { const detail = await run(); results.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`); }
  catch (error) { const detail = { name, passed: false, error: error.message }; failures.push(detail); results.push(detail); console.error(`FAIL ${name}: ${error.message}`); }
}
async function idle() { await page.waitForTimeout(1200); }
async function focusCheck() {
  const previous = accountChecks;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !document.body.textContent.includes("Checking account…"));
  await idle();
  assert.ok(accountChecks > previous, "Focus must still verify the account");
}
try {
  await mkdir(evidence, { recursive: true });
  const authConfig = await context.request.get(`${origin}/api/auth/config`);
  const settings = await authConfig.json();
  assert.equal(settings.config?.projectId, "demo-airplane-games", "QA must use the demo Firebase project");
  assert.equal(settings.emulatorUrl, "http://127.0.0.1:9099", "QA must use the local Auth emulator");
  await signInDemoEditor(page, origin, "/contribute?view=mine");
  await page.getByText("You haven’t sent a proposal yet.", { exact: true }).waitFor();
  await idle();
  await page.screenshot({ path: `${evidence}/desktop-dark.png`, fullPage: true });
  await check("An idle submissions page does not repeatedly fetch or navigate", async () => {
    const before = { listRequests, navigations };
    await page.waitForTimeout(2000);
    assert.equal(listRequests, before.listRequests);
    assert.equal(navigations, before.navigations);
    return before;
  });
  await check("Same-account background checks keep the page visible and do not reload submissions", async () => {
    delayAccount = true;
    const before = listRequests;
    const retainedSection = await page.locator('section[aria-labelledby="mine-title"]').elementHandle();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole("heading", { name: "My submissions", exact: true }).isVisible(), true, "Existing content must remain visible during a background account check");
    await idle();
    assert.equal(await retainedSection.evaluate(element => element.isConnected), true, "The same section node must stay mounted, including brief renders");
    assert.equal(listRequests, before, "Same-account revalidation must not refetch the list");
  });
  delayAccount = false;
  await idle();
  for (const width of [320, 768, 1024, 1440]) {
    await check(`Submissions have breathing room at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Contributor pages"]');
        const section = document.querySelector('section[aria-labelledby="mine-title"]');
        const header = section.firstElementChild;
        const empty = [...section.querySelectorAll(".notice")].find(el => el.textContent.includes("You haven’t sent"));
        const style = getComputedStyle(empty);
        return { overflow: document.documentElement.scrollWidth > innerWidth, tabsGap: section.getBoundingClientRect().top - nav.getBoundingClientRect().bottom, contentGap: empty.getBoundingClientRect().top - header.getBoundingClientRect().bottom, padding: parseFloat(style.paddingTop), emptyHeight: empty.getBoundingClientRect().height };
      });
      assert.equal(layout.overflow, false, "No horizontal overflow");
      assert.ok(layout.tabsGap >= 20, `Tabs gap ${layout.tabsGap}px must be at least 20px`);
      assert.ok(layout.contentGap >= 20, `Heading gap ${layout.contentGap}px must be at least 20px`);
      assert.ok(layout.padding >= 20, `Empty-state padding ${layout.padding}px must be at least 20px`);
      assert.ok(layout.emptyHeight >= 140, `Empty-state height ${layout.emptyHeight}px must be at least 140px`);
      return layout;
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/mobile-dark.png`, fullPage: true });
  await page.getByRole("button", { name: "Use light theme" }).click();
  await page.screenshot({ path: `${evidence}/mobile-light.png`, fullPage: true });
  await page.getByRole("button", { name: "Start a proposal", exact: false }).click();
  await check("New proposal form fits narrow mobile", async () => {
    await page.locator("#field-title").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${evidence}/form-mobile-light.png`, fullPage: true });
  });
  await check("Drafts stay mounted and submit waits for background validation", async () => {
    const input = page.locator("#field-title");
    await input.fill("Unsent local draft");
    const retainedInput = await input.elementHandle();
    delayAccount = true;
    try {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(200);
      assert.equal(await retainedInput.evaluate(element => element.isConnected), true);
      assert.equal(await input.inputValue(), "Unsent local draft");
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
      await idle();
      assert.equal(await retainedInput.evaluate(element => element.isConnected), true);
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), false);
    } finally { delayAccount = false; }
  });
  await page.getByRole("button", { name: /^My submissions/ }).click();
  await idle();
  submissions = [{ id: "local-ui-fixture", photoUrl: null, status: "pending", updatedAt: "2026-10-23T00:00:00Z", data: { title: "Local layout fixture", category: "aircraft" } }];
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("heading", { name: "Local layout fixture" }).waitFor();
  await check("Manual refresh preserves the loaded rows while pending", async () => {
    delayList = true;
    const before = listRequests;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Refresh", exact: true }).isDisabled(), true);
    await idle();
    assert.equal(listRequests, before + 1);
  });
  delayList = false;
  await check("Failed background validation hides private data and retry recovers", async () => {
    malformedAccount = true;
    await focusCheck();
    await page.getByRole("heading", { name: "Account check unavailable" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false);
    malformedAccount = false;
    let release;
    accountBarrier = new Promise(resolve => { release = resolve; });
    try {
      await page.getByRole("button", { name: "Retry account check" }).click();
      await page.waitForTimeout(200);
      assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false, "Failed validation must not reveal retained private data while retry is pending");
      await page.getByRole("heading", { name: "Checking account…" }).waitFor();
    } finally { accountBarrier = null; release?.(); }
    await page.getByRole("heading", { name: "Local layout fixture" }).waitFor();
  });
  await check("A real Firebase account switch fences old rows before delayed validation", async () => {
    const second = await context.newPage();
    let release;
    try {
      await second.goto(`${origin}/sign-in?return_to=%2Faccount`, { waitUntil: "domcontentloaded" });
      await second.getByRole("textbox", { name: "Email address" }).fill("photographer-a@sites.test");
      await second.getByLabel("Password", { exact: true }).fill("LocalPreview-2026!");
      // Keep A's list request pending across the real cross-tab Firebase identity change.
      delayList = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      accountBarrier = new Promise(resolve => { release = resolve; });
      await second.getByRole("button", { name: "Sign in", exact: true }).click();
      await second.waitForURL(url => url.pathname === "/account", { timeout: 30000 });
      await page.waitForFunction(() => !document.querySelector('section[aria-labelledby="mine-title"]'), undefined, { timeout: 10000 });
      assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false);
      await page.waitForTimeout(1000);
      assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false, "Late responses for account A must not restore its rows");
    } finally {
      accountBarrier = null;
      release?.();
      delayList = false;
      await second.close();
    }
    await idle();
    await page.getByRole("heading", { name: "Account session changed" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false);
  });
  await check("Confirmed sign-out clears private submissions", async () => {
    denyAccount = true;
    await focusCheck();
    await page.getByRole("heading", { name: "Sign in to continue" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Local layout fixture" }).isVisible(), false);
  });
  await check("No uncaught browser errors", async () => assert.deepEqual(errors, []));
} finally {
  await writeFile(`${evidence}/results.json`, JSON.stringify({ origin, results, errors, listRequests, accountChecks, navigations }, null, 2) + "\n");
  await browser.close();
}
if (failures.length) process.exitCode = 1;
