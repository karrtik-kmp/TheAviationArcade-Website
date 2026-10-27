// Returning to a tab re-checks the account in the background, and editorial entry points follow the
// server's staff check. Local only: run against `npm run demo:preview` with the Auth Emulator seeded.
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

const context = await browser.newContext();
const admin = await context.newPage();
const calls = track(admin);
await signIn(admin, "/admin/sign-in", "seedy@sites.test");
await admin.locator(".admin-app").waitFor({ timeout: 30000 });
await admin.waitForLoadState("networkidle");
// Anything that remounts the workspace or shows the gate is recorded here.
await admin.evaluate(() => {
  window.__gateSeen = false;
  document.querySelector(".admin-app").dataset.probe = "kept";
  new MutationObserver(() => {
    if (document.querySelector(".admin-gate")) window.__gateSeen = true;
  }).observe(document.body, { childList: true, subtree: true });
});
const probe = () => admin.evaluate(() => ({
  gateSeen: window.__gateSeen,
  kept: document.querySelector(".admin-app")?.dataset.probe === "kept",
}));
calls.take();

await check("tab switches within a minute keep the workspace and send no account traffic", async () => {
  const other = await context.newPage();
  await other.goto(origin + "/about", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 3; i++) {
    await admin.bringToFront(); await tabReturn(admin);
    await other.bringToFront(); await admin.waitForTimeout(300);
  }
  await admin.bringToFront(); await tabReturn(admin);
  await admin.waitForTimeout(1500);
  await other.close();
  const sent = calls.take().filter((c) => /\/api\/(account|auth\/session|admin)/.test(c));
  assert.deepEqual(sent, []);
  assert.deepEqual(await probe(), { gateSeen: false, kept: true });
});

await check("a forced re-check runs once in the background without resending the token", async () => {
  await restore(admin);
  await admin.waitForTimeout(1500);
  const sent = calls.take().filter((c) => /\/api\/(account|auth\/session|admin)/.test(c));
  assert.deepEqual(sent, ["GET /api/account"]);
  assert.deepEqual(await probe(), { gateSeen: false, kept: true });
});

await check("a lost session cookie is mirrored again without blanking the workspace", async () => {
  await context.clearCookies();
  await restore(admin);
  await admin.waitForTimeout(2500);
  const sent = calls.take().filter((c) => /\/api\/(account|auth\/session|admin)/.test(c));
  assert.deepEqual(sent, ["GET /api/account", "POST /api/auth/session", "GET /api/account"]);
  assert.deepEqual(await probe(), { gateSeen: false, kept: true });
  const account = await admin.evaluate(async () => (await fetch("/api/account")).json());
  assert.equal(account.isStaff, true);
});

await check("staff see the footer editor link on public pages", async () => {
  const page = await context.newPage();
  await page.goto(origin + "/about", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Editor workspace" }).waitFor({ timeout: 15000 });
  await page.close();
});

await check("signing out in another tab still clears the workspace immediately", async () => {
  const other = await context.newPage();
  await other.goto(origin + "/sign-out", { waitUntil: "domcontentloaded" });
  await admin.locator(".admin-gate").waitFor({ timeout: 15000 });
  assert.equal(await admin.locator(".admin-app").count(), 0);
  await other.close();
});

const photographerContext = await browser.newContext();
await check("a photographer sees no editorial entry points", async () => {
  const page = await photographerContext.newPage();
  await signIn(page, "/sign-in?as=photographer", "photographer-a@sites.test");
  await page.waitForURL((url) => url.pathname !== "/sign-in", { timeout: 30000, waitUntil: "commit" });
  await page.goto(origin + "/account", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "My submissions" }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole("link", { name: "Editor workspace" }).count(), 0);
  assert.equal(await page.getByText(/editorial/i).count(), 0);
  await page.getByRole("button", { name: "Account menu" }).click();
  assert.equal(await page.getByRole("link", { name: "Editorial workspace" }).count(), 0);
});

await browser.close();
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
