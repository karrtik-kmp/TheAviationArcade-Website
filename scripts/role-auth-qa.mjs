import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const origin = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:5188");
const prefix = process.env.QA_BASE_PATH || "/play";
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
assert.equal(origin.protocol, "http:");
assert.equal(origin.pathname, "/");
assert.match(prefix, /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/);
const url = (path) => `${origin.origin}${prefix}${path}`;
const emulator = "http://127.0.0.1:9099";
const email = `role-path-${Date.now()}@sites.test`;
const password = "LocalRolePreview-2026!";
const evidence = "docs/evidence/role-auth";
const results = [],
  pageErrors = [],
  blockedRequests = [],
  unprefixedAssets = [],
  assetFailures = [];
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.route("**/*", async (route) => {
  const target = new URL(route.request().url());
  if (
    ["http:", "https:"].includes(target.protocol) &&
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  ) {
    blockedRequests.push(target.origin);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(90000);
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  const target = new URL(request.url());
  if (
    target.origin === origin.origin &&
    /^\/(fonts|media)\//.test(target.pathname)
  )
    unprefixedAssets.push(target.pathname);
});
page.on("response", (response) => {
  if (
    ["font", "image", "stylesheet", "script"].includes(
      response.request().resourceType(),
    ) &&
    response.status() >= 400
  )
    assetFailures.push({
      url: new URL(response.url()).pathname,
      status: response.status(),
    });
});
await mkdir(evidence, { recursive: true });
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
    throw error;
  }
}
async function account() {
  const response = await context.request.get(url("/api/account"));
  assert.equal(response.status(), 200);
  return response.json();
}
async function emulatorCall(action, data) {
  const response = await fetch(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = await response.json();
  assert.equal(
    response.ok,
    true,
    body.error?.message || "Emulator request failed",
  );
  return body;
}
async function signIn(path) {
  await page.goto(url(path), { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function logout() {
  await page.goto(url("/sign-out"), { waitUntil: "domcontentloaded" });
  await page.waitForURL(
    (target) =>
      target.pathname === `${prefix}/account` &&
      target.searchParams.get("signed_out") === "1",
    { waitUntil: "domcontentloaded" },
  );
  await page.getByRole("heading", { name: "Sign in to continue" }).waitFor();
  assert.equal((await account()).user, null);
}
let created = false,
  failure;
try {
  await check(
    "Prefix uses the local emulator and all role pages retain their audience",
    async () => {
      const response = await context.request.get(url("/api/auth/config"));
      assert.equal(response.status(), 200);
      const config = await response.json();
      assert.equal(config.config.projectId, "demo-airplane-games");
      assert.equal(config.emulatorUrl, emulator);
      for (const [path, label] of [
        ["/admin/sign-in", "Staff access"],
        ["/sign-in?as=photographer", "Photographer"],
        ["/sign-in?as=player", "Player"],
      ]) {
        await page.goto(url(path), { waitUntil: "domcontentloaded" });
        await page.getByRole("textbox", { name: "Email address" }).fill("");
        assert.match(
          await page.locator(".auth-card .eyebrow").innerText(),
          new RegExp(label, "i"),
        );
        const editor = label === "Staff access";
        assert.equal(
          await page.getByRole("button", { name: "Fill demo login" }).count(),
          editor ? 1 : 0,
        );
        // Editors have their own page with no self-registration; the others pick a role.
        assert.equal(
          await page.getByRole("button", { name: "Create an account" }).count(),
          editor ? 0 : 1,
        );
        assert.equal(await page.getByRole("radio").count(), editor ? 0 : 2);
        if (!editor)
          assert.equal(
            await page.getByRole("radio", { name: new RegExp(label) }).isChecked(),
            true,
          );
        const links = await page
          .locator('a[href^="/"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("href")),
          );
        assert.ok(
          links.every(
            (href) => href === prefix || href.startsWith(`${prefix}/`),
          ),
          `Unprefixed links on ${path}`,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      }
    },
  );
  await check(
    "Anonymous guards and the shared sign-in page keep the prefix, role and safe query",
    async () => {
      await page.goto(url("/admin"), { waitUntil: "domcontentloaded" });
      await page.waitForURL(url("/admin/sign-in"));
      await page.goto(url("/play"), { waitUntil: "domcontentloaded" });
      await page.waitForURL(url("/sign-in?as=player"));
      await page.goto(url("/sign-in?return_to=%2Fadmin"), {
        waitUntil: "domcontentloaded",
      });
      await page.waitForURL(url("/admin/sign-in"));
      const destination = "/contribute?game=aircraft-identifier&view=mine";
      await page.goto(
        url(`/sign-in?return_to=${encodeURIComponent(destination)}`),
        { waitUntil: "domcontentloaded" },
      );
      assert.equal(new URL(page.url()).pathname, `${prefix}/sign-in`);
      assert.equal(
        await page.getByRole("radio", { name: /Photographer/ }).isChecked(),
        true,
      );
      // Switching role rewrites the address to that role's home.
      await page.locator("label.auth-role", { hasText: "Player" }).click();
      const switched = new URL(page.url());
      assert.equal(switched.pathname, `${prefix}/sign-in`);
      assert.equal(switched.searchParams.get("as"), "player");
      assert.equal(switched.searchParams.get("return_to"), null);
      await page.goto(url("/sign-in?return_to=https%3A%2F%2Fevil.example"), {
        waitUntil: "domcontentloaded",
      });
      assert.equal(new URL(page.url()).pathname, `${prefix}/sign-in`);
      assert.equal(
        await page.getByRole("radio", { name: /Player/ }).isChecked(),
        true,
      );
    },
  );
  await check(
    "Player signup and email verification preserve the prefixed player destination",
    async () => {
      await page.goto(url("/sign-in?as=player"), {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("textbox", { name: "Email address" }).fill(email);
      await page
        .getByRole("button", { name: "Create an account", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Create your account", exact: true })
        .waitFor();
      await page.getByRole("textbox", { name: "Email address" }).fill(email);
      await page
        .getByRole("textbox", { name: /Display name/ })
        .fill("Role QA Pilot");
      await page.locator('input[name="password"]').fill(password);
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page.waitForURL(
        (target) =>
          target.pathname === `${prefix}/account` &&
          target.searchParams.get("verify_email") === "1",
        { waitUntil: "domcontentloaded" },
      );
      created = true;
      assert.equal(new URL(page.url()).searchParams.get("return_to"), "/play");
      await page
        .getByRole("button", { name: "I’ve verified", exact: true })
        .waitFor();
      const codes = await (
        await fetch(
          `${emulator}/emulator/v1/projects/demo-airplane-games/oobCodes`,
          { signal: AbortSignal.timeout(10000) },
        )
      ).json();
      const code = codes.oobCodes.findLast(
        (item) => item.email === email && item.requestType === "VERIFY_EMAIL",
      );
      assert.ok(code, "Verification code missing");
      await emulatorCall("update", { oobCode: code.oobCode });
      await page
        .getByRole("button", { name: "I’ve verified", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /^Email verified\.$/ })
        .waitFor();
      const next = page.getByRole("link", { name: "Continue", exact: true });
      assert.equal(await next.getAttribute("href"), `${prefix}/play`);
      await next.click();
      await page.waitForURL(url("/play"), { waitUntil: "domcontentloaded" });
    },
  );
  await check(
    "Player preview and assets are honest and work under a colliding prefix",
    async () => {
      await page.getByText("Linking coming soon", { exact: true }).waitFor();
      assert.equal(await page.getByText(/^Linked \w/).count(), 0);
      assert.match(
        await page.locator(".account-hero").innerText(),
        /sample name tag/i,
      );
      assert.match(
        await page.locator(".account-hero").innerText(),
        /existing Callsign/,
      );
      assert.equal((await account()).isStaff, false);
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(() => [
        document.fonts.check('16px "Barlow"'),
        document.fonts.check('16px "Poppins"'),
      ]);
      assert.deepEqual(fonts, [true, true]);
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .waitFor();
      await page.screenshot({
        path: `${evidence}/player-prefixed-mobile.png`,
        fullPage: true,
      });
      await logout();
    },
  );
  await check(
    "Photographer sign-in retains query filters and logout stays under the prefix",
    async () => {
      const destination = "/contribute?game=aircraft-identifier&view=mine";
      await signIn(
        `/sign-in?as=photographer&return_to=${encodeURIComponent(destination)}`,
      );
      await page.waitForURL(
        (target) =>
          target.pathname === `${prefix}/contribute` &&
          target.searchParams.get("view") === "mine",
        { waitUntil: "domcontentloaded" },
      );
      assert.equal(
        new URL(page.url()).searchParams.get("game"),
        "aircraft-identifier",
      );
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .waitFor();
      assert.ok((await account()).user);
      await logout();
    },
  );
  await check(
    "Admin sign-in does not grant staff access to a player/contributor account",
    async () => {
      await signIn("/admin/sign-in");
      await page.waitForURL(url("/admin"), { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Access unavailable", exact: true })
        .waitFor();
      const denied = await context.request.get(url("/api/admin/submissions"));
      assert.equal(denied.status(), 403);
      await logout();
    },
  );
  await check(
    "Demo login opens the prefixed read-only admin and remains denied live APIs",
    async () => {
      await page.goto(url("/admin/sign-in"), { waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: "Fill demo login", exact: true })
        .click();
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(url("/admin"), { waitUntil: "domcontentloaded" });
      await page
        .getByText(/This demo account can view content but cannot edit/)
        .waitFor();
      assert.equal(
        (await context.request.get(url("/api/admin/submissions"))).status(),
        403,
      );
      await logout();
    },
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(assetFailures, []);
  assert.deepEqual(unprefixedAssets, []);
  assert.deepEqual(blockedRequests, []);
} catch (error) {
  failure = error;
} finally {
  if (created) {
    try {
      const user = await emulatorCall("signInWithPassword", {
        email,
        password,
        returnSecureToken: true,
      });
      await emulatorCall("delete", { idToken: user.idToken });
    } catch (error) {
      failure ??= error;
    }
  }
  await browser.close();
  await writeFile(
    `${evidence}/qa.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        origin: origin.origin,
        basePath: prefix,
        scope:
          "Local browser + demo Auth Emulator only; no live Google or game linking tested.",
        results,
        pageErrors,
        assetFailures,
        unprefixedAssets,
        blockedRequests,
        ...(failure ? { failure: String(failure) } : {}),
      },
      null,
      2,
    ) + "\n",
  );
}
if (failure) throw failure;
console.log(`Role auth checks passed: ${results.length}`);
