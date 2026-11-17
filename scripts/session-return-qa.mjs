// Returning to a tab re-checks the account in the background without blanking the signed-in page, and
// staff status follows the server's check. The editors' desks are in the Admin repo (decision I-1), so the
// page watched here is /account. Local only: run against `npm run demo:preview` with the Auth Emulator seeded.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:5186");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "QA_ORIGIN must use a loopback host");
const origin = target.origin;
const password = "LocalPreview-2026!";
const config = await (await fetch(origin + "/api/auth/config")).json();
assert.equal(config.config?.projectId, "demo-airplane-games", "must target the local emulator project");

const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
const results = [];
async function check(name, run) {
  try { await run(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message.split("\n")[0]}`); }
}
function track(page) {
  const calls = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/")) calls.push(`${r.method()} ${path}`);
  });
  return {
    take() { return calls.splice(0); },
  };
}
async function signIn(page, path, email) {
  await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
const tabReturn = (page) =>
  page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
const restore = (page) =>
  page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
const accountTraffic = (calls) => calls.filter((c) => /\/api\/(account|auth\/session)/.test(c));

const context = await browser.newContext();
const staff = await context.newPage();
const calls = track(staff);
// seedy@sites.test is staff through MOCK_ADMIN_EMAILS in the demo-preview profile.
await signIn(staff, "/sign-in?return_to=%2Faccount", "seedy@sites.test");
await staff.waitForURL((url) => url.pathname === "/account", { timeout: 30000 });
await staff.locator(".account-profile-panel").waitFor({ timeout: 30000 });
await staff.waitForLoadState("networkidle");
// Anything that remounts the signed-in panel or shows the checking / signed-out state is recorded here.
await staff.evaluate(() => {
  window.__blanked = false;
  document.querySelector(".account-profile-panel").dataset.probe = "kept";
  const blank = () =>
    [...document.querySelectorAll("main .account-panel")].some((panel) =>
      /Checking your account|Sign in to continue|Account status unavailable/.test(panel.textContent || ""));
  new MutationObserver(() => {
    if (blank()) window.__blanked = true;
  }).observe(document.body, { childList: true, subtree: true });
});
const probe = () => staff.evaluate(() => ({
  blanked: window.__blanked,
  kept: document.querySelector(".account-profile-panel")?.dataset.probe === "kept",
}));
calls.take();

await check("tab switches within a minute keep the signed-in page and send no account traffic", async () => {
  const other = await context.newPage();
  await other.goto(origin + "/about", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 3; i++) {
    await staff.bringToFront(); await tabReturn(staff);
    await other.bringToFront(); await staff.waitForTimeout(300);
  }
  await staff.bringToFront(); await tabReturn(staff);
  await staff.waitForTimeout(1500);
  await other.close();
  assert.deepEqual(accountTraffic(calls.take()), []);
  assert.deepEqual(await probe(), { blanked: false, kept: true });
});

await check("a forced re-check runs once in the background without resending the token", async () => {
  await restore(staff);
  await staff.waitForTimeout(1500);
  assert.deepEqual(accountTraffic(calls.take()), ["GET /api/account"]);
  assert.deepEqual(await probe(), { blanked: false, kept: true });
});

await check("a lost session cookie is mirrored again without blanking the page", async () => {
  await context.clearCookies();
  await restore(staff);
  await staff.waitForTimeout(2500);
  assert.deepEqual(accountTraffic(calls.take()), ["GET /api/account", "POST /api/auth/session", "GET /api/account"]);
  assert.deepEqual(await probe(), { blanked: false, kept: true });
  const account = await staff.evaluate(async () => (await fetch("/api/account")).json());
  assert.equal(account.isStaff, true);
});

await check("staff get no editors' link on a local host, which has no known Admin", async () => {
  const page = await context.newPage();
  await page.goto(origin + "/about", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Account menu" }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole("link", { name: "Editor workspace" }).count(), 0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "My account", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Editorial workspace" }).count(), 0);
  await page.close();
});

await check("signing out in another tab clears the signed-in page immediately", async () => {
  const other = await context.newPage();
  await other.goto(origin + "/sign-out", { waitUntil: "domcontentloaded" });
  await staff.getByRole("heading", { name: "Sign in to continue", exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await staff.locator(".account-profile-panel").count(), 0);
  await other.close();
});

const photographerContext = await browser.newContext();
await check("a photographer sees no editorial entry points", async () => {
  const page = await photographerContext.newPage();
  await signIn(page, "/sign-in?as=photographer", "photographer-a@sites.test");
  await page.waitForURL((url) => url.pathname !== "/sign-in", { timeout: 30000, waitUntil: "commit" });
  await page.goto(origin + "/account", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Photo area", exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole("link", { name: "Editor workspace" }).count(), 0);
  assert.equal(await page.getByText(/editorial/i).count(), 0);
  await page.getByRole("button", { name: "Account menu" }).click();
  assert.equal(await page.getByRole("link", { name: "Editorial workspace" }).count(), 0);
});

await browser.close();
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
