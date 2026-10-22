import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// End-to-end auth regression harness. It is deliberately restricted to local
// preview + Firebase Auth Emulator hosts; it must never be pointed at prod.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5173";
const emulator = process.env.FIREBASE_AUTH_EMULATOR || "http://127.0.0.1:9099";
const projectId = process.env.FIREBASE_PROJECT_ID || "demo-airplane-games";
const password = process.env.QA_LOCAL_PASSWORD || "LocalPreview-2026!";
const evidencePath = "docs/evidence/firebase-auth-qa.json";
const emailSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}@sites.test`;
const qaUsers = {
  editor: { email: "seedy@sites.test", displayName: "Local QA Editor" },
  photographerA: {
    email: "photographer-a@sites.test",
    displayName: "Photographer A",
  },
  photographerB: {
    email: "photographer-b@sites.test",
    displayName: "Photographer B",
  },
};
const results = [];
const blockedRequests = [];
const expectedBlockedRequests = [];
const pageErrors = [];
let browser;
let context;
let page;

function assertLoopback(raw, expectedPort, label) {
  const url = new URL(raw);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname),
    `${label} must use a loopback host`,
  );
  if (expectedPort)
    assert.equal(
      url.port,
      String(expectedPort),
      `${label} must use port ${expectedPort}`,
    );
  assert.equal(url.protocol, "http:", `${label} must use plain local HTTP`);
  return url.origin;
}

const localOrigin = assertLoopback(origin, 5173, "QA_ORIGIN");
const authOrigin = assertLoopback(emulator, 9099, "FIREBASE_AUTH_EMULATOR");
assert.equal(
  projectId,
  "demo-airplane-games",
  "This harness is only for the local test project",
);

async function check(name, run) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await run();
    if (detail?.skipped === true) {
      const { skipped: _skipped, ...evidence } = detail;
      results.push({ name, status: "skipped", startedAt, ...evidence });
      console.log(`SKIP ${name}: ${detail.reason}`);
      return;
    }
    results.push({ name, status: "passed", startedAt, ...(detail ?? {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      status: "failed",
      startedAt,
      error: String(error?.stack || error),
    });
    console.error(`FAIL ${name}: ${error?.message || error}`);
    throw error;
  }
}

async function emulatorCall(path, body) {
  const response = await fetch(`${authOrigin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function createOrUpdateUser({ email, displayName, verified = true }) {
  let result = await emulatorCall(
    `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      email,
      password,
      returnSecureToken: true,
    },
  );
  if (!result.data.idToken) {
    result = await emulatorCall(
      `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
      {
        email,
        password,
        returnSecureToken: true,
      },
    );
  }
  assert.ok(
    result.data.idToken,
    `Could not seed emulator user ${email}: ${result.data.error?.message || result.status}`,
  );
  const update = await emulatorCall(
    `/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    {
      idToken: result.data.idToken,
      displayName,
      returnSecureToken: true,
    },
  );
  assert.equal(
    update.status,
    200,
    `Could not update emulator profile ${email}: ${update.data.error?.message || update.status}`,
  );

  if (verified) {
    // accounts:update profile responses omit idToken in the emulator even
    // when returnSecureToken is set, so sign in again before sending OOB mail.
    const fresh = await signInToken(email);
    assert.ok(
      fresh.idToken,
      `Could not refresh emulator credentials for ${email}`,
    );
    const account = await emulatorCall(
      `/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`,
      {
        idToken: fresh.idToken,
      },
    );
    if (!account.data.users?.[0]?.emailVerified) {
      const code = await getOobCode(email, "VERIFY_EMAIL");
      const verifiedResponse = await emulatorCall(
        `/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
        { oobCode: code },
      );
      assert.equal(
        verifiedResponse.data.emailVerified,
        true,
        `Could not verify emulator user ${email}`,
      );
    }
  }
  return result.data;
}

async function signInToken(email, suppliedPassword = password) {
  const result = await emulatorCall(
    `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      email,
      password: suppliedPassword,
      returnSecureToken: true,
    },
  );
  return { ...result, idToken: result.data.idToken };
}

async function getOobCode(email, requestType) {
  const requestBody = { requestType };
  if (requestType === "VERIFY_EMAIL") {
    const signedIn = await signInToken(email);
    assert.ok(
      signedIn.idToken,
      `Could not get a local ID token to verify ${email}`,
    );
    requestBody.idToken = signedIn.idToken;
  } else {
    requestBody.email = email;
  }
  const result = await emulatorCall(
    `/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake-api-key`,
    requestBody,
  );
  assert.ok(
    result.data.email,
    `Emulator did not enqueue ${requestType} for the QA account`,
  );
  const response = await fetch(
    `${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  assert.ok(
    response.ok,
    `Could not read local emulator OOB codes: ${response.status}`,
  );
  const body = await response.json();
  const code = (body.oobCodes || [])
    .filter(
      (entry) =>
        entry.email?.toLowerCase() === email.toLowerCase() &&
        entry.requestType === requestType,
    )
    .at(-1)?.oobCode;
  assert.ok(code, `No local ${requestType} code found for ${email}`);
  return code;
}

async function api(path, method = "GET", data, headers = {}) {
  return context.request.fetch(`${localOrigin}${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: localOrigin }),
      ...headers,
    },
    ...(data === undefined ? {} : { data }),
  });
}

async function accountSnapshot() {
  const response = await api("/api/account");
  const body = await response.json();
  return { response, body };
}

async function waitForAuthReady() {
  await page.waitForFunction(
    () => {
      const submit = document.querySelector(".auth-submit");
      return submit instanceof HTMLButtonElement && !submit.disabled;
    },
    { timeout: 30000 },
  );
}

async function signInThroughForm(email, userPassword = password, returnTo) {
  const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
  await page.goto(`${localOrigin}/sign-in${query}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForAuthReady();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(userPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    (url) => url.origin === localOrigin && url.pathname !== "/sign-in",
    { timeout: 30000 },
  );
}

async function signOutThroughUI() {
  await page.goto(`${localOrigin}/account`, { waitUntil: "domcontentloaded" });
  const signOut = page.getByRole("link", { name: "Sign out", exact: true });
  const signInHeading = page.getByRole("heading", {
    name: "Sign in to continue",
    exact: true,
  });
  await page.waitForFunction(
    () => {
      const text = document.querySelector("main")?.innerText || "";
      return (
        text.includes("Sign out") ||
        text.includes("Sign in to continue") ||
        text.includes("Account status unavailable")
      );
    },
    { timeout: 30000 },
  );
  const before = (await accountSnapshot()).body;
  if (before.user) {
    await signOut.waitFor({ state: "visible", timeout: 10000 });
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname === "/account" &&
          url.searchParams.get("signed_out") === "1",
        { timeout: 30000 },
      ),
      signOut.click(),
    ]);
  } else {
    await signInHeading.waitFor({ timeout: 10000 });
  }
  await page.goto(`${localOrigin}/account`, { waitUntil: "domcontentloaded" });
  await signInHeading.waitFor({ timeout: 20000 });
  assert.equal(
    (await accountSnapshot()).body.user,
    null,
    "Server account session must be anonymous after sign-out",
  );
}

async function assertAccountShape(expectedUser, isStaff) {
  const { response, body } = await accountSnapshot();
  assert.equal(response.status(), 200);
  assert.match(response.headers()["cache-control"] || "", /private/i);
  assert.match(response.headers()["cache-control"] || "", /no-store/i);
  assert.equal(body.isStaff, isStaff);
  assert.equal(
    body.user?.displayName ?? null,
    expectedUser?.displayName ?? null,
  );
  if (expectedUser) assert.equal(typeof body.user.emailVerified, "boolean");
  assert.equal(
    Object.hasOwn(body.user || {}, "email"),
    false,
    "Account API must not expose an email address",
  );
  assert.equal(
    Object.hasOwn(body.user || {}, "userId"),
    false,
    "Account API must not expose raw identity ids",
  );
  assert.equal(typeof body.sessionKey, expectedUser ? "string" : "object");
  return body;
}

async function uploadLocalProposal(title) {
  await page.goto(
    `${localOrigin}/contribute?category=aircraft&game=aircraft-identifier&view=new`,
    { waitUntil: "domcontentloaded" },
  );
  await page.locator("#field-photo").setInputFiles("public/media/aircraft.jpg");
  await page.locator("#field-title").fill(title);
  await page
    .locator("#field-description")
    .fill("Local Firebase Auth Emulator QA fixture. Not a rights grant.");
  await page.locator("#field-aircraft").fill("Boeing 767-200");
  await page.locator("#field-location").fill("Local QA fixture");
  await page.locator("#field-credit").fill("Local QA");
  await page
    .locator("#field-factualSource")
    .fill("https://www.boeing.com/commercial/767/");
  await page
    .locator("#field-rightsEvidence")
    .fill("Local-only emulator test. Not evidence for public use.");
  for (const label of ["Game content", "Website & gallery", "Plane of the Day"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.locator("#field-consent").check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/submissions" &&
        r.request().method() === "POST",
      { timeout: 60000 },
    ),
    page
      .getByRole("button", { name: "Send for private review", exact: true })
      .click(),
  ]);
  const body = await response.json();
  assert.equal(response.status(), 201, JSON.stringify(body));
  return body.submission;
}

async function currentSubmissionIds() {
  const response = await api("/api/submissions");
  assert.equal(response.status(), 200, await response.text());
  const body = await response.json();
  return (body.submissions || []).map((item) => item.id);
}

async function main() {
  const emulatorHealth = await fetch(
    `${authOrigin}/emulator/v1/projects/${projectId}/config`,
  );
  assert.ok(
    emulatorHealth.ok,
    `Auth Emulator is not reachable at ${authOrigin} for ${projectId}`,
  );
  await createOrUpdateUser(qaUsers.editor);
  await createOrUpdateUser(qaUsers.photographerA);
  await createOrUpdateUser(qaUsers.photographerB);

  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await context.route("**/*", async (route) => {
    const raw = route.request().url();
    if (/^(data|blob):/.test(raw)) return route.continue();
    try {
      const url = new URL(raw);
      if ([localOrigin, authOrigin].includes(url.origin))
        return route.continue();
      const request = {
        url: url.origin,
        resourceType: route.request().resourceType(),
      };
      if (
        url.hostname === "apis.google.com" &&
        request.resourceType === "script"
      )
        expectedBlockedRequests.push(request);
      else blockedRequests.push(request);
      return route.abort("blockedbyclient");
    } catch {
      blockedRequests.push({
        url: raw,
        resourceType: route.request().resourceType(),
      });
      return route.abort("blockedbyclient");
    }
  });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await check(
    "Firebase runtime config is configured for this local emulator only",
    async () => {
      const response = await fetch(`${localOrigin}/api/auth/config`, {
        headers: { Accept: "application/json" },
      });
      assert.ok(response.ok, `Auth config returned ${response.status}`);
      const config = await response.json();
      assert.equal(config.configured, true);
      assert.equal(config.config?.projectId, projectId);
      assert.match(config.config?.authDomain || "", /firebaseapp\.com$/);
      assert.equal(config.emulatorUrl, authOrigin);
      return { projectId: config.config.projectId, emulator: authOrigin };
    },
  );

  await check(
    "Anonymous account response is private and protected APIs deny access",
    async () => {
      const body = await assertAccountShape(null, false);
      assert.equal(body.user, null);
      assert.equal(body.sessionKey, null);
      const admin = await api("/api/admin/submissions");
      assert.equal(admin.status(), 401);
      const submissions = await api("/api/submissions");
      assert.equal(submissions.status(), 401);
      await page.goto(`${localOrigin}/admin`);
      await page
        .getByRole("heading", { name: "Editor sign in", exact: true })
        .waitFor();
      await page.goto(
        `${localOrigin}/contribute?category=aircraft&game=aircraft-identifier&view=mine`,
      );
      await page
        .getByRole("heading", { name: "Sign in to contribute", exact: true })
        .waitFor();
      const signInHrefs = await page
        .locator('a[href^="/sign-in?"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      assert.ok(
        signInHrefs.some((href) => {
          if (!href) return false;
          const url = new URL(href, localOrigin);
          return (
            url.searchParams.get("return_to") ===
            "/contribute?category=aircraft&game=aircraft-identifier&view=mine"
          );
        }),
        "Anonymous contributor CTA must preserve safe filters and view=mine",
      );
    },
  );

  await check(
    "Sign-in rejects an incorrect password without authenticating",
    async () => {
      await page.goto(`${localOrigin}/sign-in`);
      await waitForAuthReady();
      await page
        .getByRole("textbox", { name: "Email address" })
        .fill(qaUsers.photographerA.email);
      await page.getByLabel("Password").fill("incorrect-local-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: /incorrect/i })
        .waitFor();
      const { body } = await accountSnapshot();
      assert.equal(body.user, null);
    },
  );

  await check(
    "Account control preserves safe category, game and mine filters through sign-in",
    async () => {
      const target =
        "/contribute?category=aircraft&game=aircraft-identifier&view=mine";
      await page.goto(`${localOrigin}${target}`);
      const signInLink = page
        .getByRole("link", { name: "Sign in", exact: true })
        .first();
      await signInLink.waitFor();
      const href = await signInLink.getAttribute("href");
      assert.ok(
        href?.startsWith("/sign-in?"),
        `Unexpected sign-in href: ${href}`,
      );
      const signInUrl = new URL(href, localOrigin);
      const returnTo =
        signInUrl.searchParams.get("return_to") ||
        signInUrl.searchParams.get("returnTo");
      assert.equal(returnTo, target);
      await signInThroughForm(qaUsers.photographerA.email, password, target);
      assert.equal(new URL(page.url()).pathname, "/contribute");
      const actual = new URL(page.url());
      assert.equal(actual.searchParams.get("category"), "aircraft");
      assert.equal(actual.searchParams.get("game"), "aircraft-identifier");
      assert.equal(actual.searchParams.get("view"), "mine");
      await assertAccountShape(qaUsers.photographerA, false);
      await page
        .getByRole("heading", { name: "My submissions", exact: true })
        .waitFor({ timeout: 20000 });
    },
  );

  await check(
    "Signed-in account menu works on desktop and mobile, and Callsign copy is accurate",
    async () => {
      await mkdir("docs/evidence", { recursive: true });
      await page.goto(`${localOrigin}/account`);
      await page.getByRole("heading", { name: "My account" }).waitFor();
      await page
        .getByText("Your community name tag uses your existing Callsign.")
        .waitFor();
      assert.match(
        await page.locator("main").innerText(),
        /Linking a Callsign to this website account is not available yet/i,
      );
      const menuButton = page.getByRole("button", { name: "Account menu" });
      await menuButton.click();
      const menu = page.getByRole("navigation", { name: "Account menu" });
      await menu
        .getByRole("link", { name: "My account", exact: true })
        .waitFor();
      await menu
        .getByRole("link", { name: "My submissions", exact: true })
        .waitFor();
      assert.equal(
        await menu
          .getByRole("link", { name: "Editorial workspace", exact: true })
          .count(),
        0,
      );
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 844 });
      await menuButton.click();
      await menu.getByRole("link", { name: "Sign out", exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: "docs/evidence/firebase-auth-account-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );

  await check(
    "Staff identity is enforced by the server and nonstaff cannot open editorial routes",
    async () => {
      await signOutThroughUI();
      await signInThroughForm(qaUsers.editor.email);
      await assertAccountShape(qaUsers.editor, true);
      const response = await api("/api/admin/submissions");
      assert.equal(response.status(), 200, await response.text());
      await page.goto(`${localOrigin}/admin`);
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .waitFor({ timeout: 30000 });
      await signOutThroughUI();
      await signInThroughForm(qaUsers.photographerA.email);
      await assertAccountShape(qaUsers.photographerA, false);
      assert.equal((await api("/api/admin/submissions")).status(), 403);
      await page.goto(`${localOrigin}/admin`);
      await page
        .getByRole("heading", { name: "Access unavailable", exact: true })
        .waitFor({ timeout: 20000 });
    },
  );

  const proposalA = `Firebase QA A ${emailSuffix}`;
  const proposalB = `Firebase QA B ${emailSuffix}`;
  await check(
    "Two emulator users see only their own contribution records",
    async () => {
      const createdA = await uploadLocalProposal(proposalA);
      await signOutThroughUI();
      await signInThroughForm(qaUsers.photographerB.email);
      const bBefore = await currentSubmissionIds();
      assert.equal(
        bBefore.includes(createdA.id),
        false,
        "Photographer B must not see A's record",
      );
      const crossUserRevision = await context.request.put(
        `${localOrigin}/api/submissions/${createdA.id}`,
        {
          headers: { Origin: localOrigin, "Idempotency-Key": randomUUID() },
          multipart: {
            data: JSON.stringify({
              ...createdA.data,
              location: "Unauthorized local QA edit",
            }),
            version: String(createdA.version),
          },
        },
      );
      assert.ok(
        [403, 404].includes(crossUserRevision.status()),
        `A different user changed the proposal (${crossUserRevision.status()})`,
      );
      if (createdA.photoUrl) {
        const crossUserPhoto = await api(createdA.photoUrl);
        assert.ok(
          [403, 404].includes(crossUserPhoto.status()),
          `A different user accessed the private photo (${crossUserPhoto.status()})`,
        );
      }
      const createdB = await uploadLocalProposal(proposalB);
      await signOutThroughUI();
      await signInThroughForm(qaUsers.photographerA.email);
      const aList = await currentSubmissionIds();
      assert.ok(aList.includes(createdA.id));
      assert.equal(
        aList.includes(createdB.id),
        false,
        "Photographer A must not see B's record",
      );
      if (createdA.photoUrl) {
        const ownerPhoto = await api(createdA.photoUrl);
        assert.equal(
          ownerPhoto.status(),
          200,
          "The owner must retain access to the private photo",
        );
        assert.match(ownerPhoto.headers()["cache-control"] || "", /no-store/i);
      }
      const ownerRevision = await context.request.put(
        `${localOrigin}/api/submissions/${createdA.id}`,
        {
          headers: { Origin: localOrigin, "Idempotency-Key": randomUUID() },
          multipart: {
            data: JSON.stringify({
              ...createdA.data,
              location: "Local QA owner revision",
            }),
            version: String(createdA.version),
          },
        },
      );
      assert.equal(ownerRevision.status(), 200, await ownerRevision.text());
      await page.goto(`${localOrigin}/contribute?view=mine`);
      await page.getByRole("button", { name: /^My submissions/ }).waitFor();
      await page
        .getByRole("heading", { name: "My submissions", exact: true })
        .waitFor();
      assert.match(
        await page.locator("main").innerText(),
        new RegExp(proposalA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        new RegExp(proposalB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      return { submissionIds: { a: createdA.id, b: createdB.id } };
    },
  );

  await check(
    "A stale contributor session clears private lists and revision controls",
    async () => {
      await page.route("**/api/account", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Cache-Control": "private, no-store" },
          body: JSON.stringify({
            user: null,
            isStaff: false,
            sessionKey: null,
          }),
        }),
      );
      await page.goto(`${localOrigin}/contribute?view=mine`);
      await page
        .getByRole("heading", { name: "Sign in to continue", exact: true })
        .waitFor({ timeout: 30000 });
      await page
        .getByText(/Private proposal lists and revision details were cleared/i)
        .waitFor();
      await page
        .getByRole("link", { name: "Account options", exact: true })
        .waitFor();
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        new RegExp(proposalA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      await page.unroute("**/api/account");
      return {
        outcome:
          "simulated anonymous account snapshot via browser route; no real expiry duration waited",
      };
    },
  );

  await check(
    "Expired staff session stops admin writes and clears private workspace data",
    async () => {
      await signOutThroughUI();
      await signInThroughForm(qaUsers.editor.email);
      const staffSnapshot = (await accountSnapshot()).body;
      assert.equal(staffSnapshot.isStaff, true);
      const listResponse = await api("/api/admin/submissions");
      assert.equal(listResponse.status(), 200);
      const list = await listResponse.json();
      const pending = list.submissions?.find(
        (item) => item.status === "pending",
      );
      assert.ok(
        pending,
        "Need a pending local QA record to assert rejected writes do not mutate it",
      );
      const deniedWrite = await context.request.patch(
        `${localOrigin}/api/admin/submissions/${pending.id}`,
        {
          headers: {
            Origin: localOrigin,
            "Content-Type": "application/json",
            "X-Account-Session": "expired-stale-session-key",
          },
          data: {
            status: "rejected",
            checks: {},
            note: "Must not be applied",
            version: pending.version,
          },
        },
      );
      assert.equal(deniedWrite.status(), 409, await deniedWrite.text());
      const afterWrite = await api("/api/admin/submissions");
      assert.equal(afterWrite.status(), 200);
      const stillPending = (await afterWrite.json()).submissions.find(
        (item) => item.id === pending.id,
      );
      assert.equal(
        stillPending.status,
        "pending",
        "The rejected stale-session write must not mutate server state",
      );

      await page.route("**/api/account", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Cache-Control": "private, no-store" },
          body: JSON.stringify({
            user: { displayName: "Different QA Session", emailVerified: true },
            isStaff: true,
            sessionKey: "different-local-qa-session",
          }),
        }),
      );
      await page.goto(`${localOrigin}/admin`);
      await page
        .getByRole("heading", { name: "Account session changed", exact: true })
        .waitFor({ timeout: 30000 });
      await page
        .getByText(
          /Private editorial data was cleared and pending writes were stopped/i,
        )
        .waitFor();
      await page
        .getByRole("button", { name: "Reload workspace", exact: true })
        .waitFor();
      await page.unroute("**/api/account");
      return {
        outcome:
          "stale session write denied; account-session mismatch UI simulated without waiting for expiry duration",
      };
    },
  );

  await check(
    "Same-origin session exchange rejects wrong, expired, and cross-origin credentials",
    async () => {
      const valid = await signInToken(qaUsers.photographerA.email);
      assert.ok(valid.idToken);
      const evil = await context.request.post(
        `${localOrigin}/api/auth/session`,
        {
          headers: { Origin: "https://untrusted.invalid" },
          data: { idToken: valid.idToken },
        },
      );
      assert.equal(evil.status(), 403);
      const wrongHeader = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const wrongPayload = Buffer.from(
        JSON.stringify({ sub: "wrong-local-qa-user" }),
      ).toString("base64url");
      const wrong = await api("/api/auth/session", "POST", {
        idToken: `${wrongHeader}.${wrongPayload}.invalid`,
      });
      assert.equal(
        wrong.status(),
        401,
        `Unexpected invalid-token status ${wrong.status()}`,
      );
      const malformed = await api("/api/auth/session", "POST", {
        idToken: "not-a-firebase-token",
      });
      assert.equal(
        malformed.status(),
        401,
        `Malformed token should be unauthorized, got ${malformed.status()}`,
      );
      const expiredPayload = Buffer.from(
        JSON.stringify({
          iss: `https://securetoken.google.com/${projectId}`,
          aud: projectId,
          sub: "expired-local-qa-user",
          user_id: "expired-local-qa-user",
          iat: 1,
          exp: 2,
          auth_time: 1,
          email: qaUsers.photographerA.email,
          email_verified: true,
        }),
      ).toString("base64url");
      const expired = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${expiredPayload}.`;
      const expiredResponse = await api("/api/auth/session", "POST", {
        idToken: expired,
      });
      assert.ok(
        [400, 401].includes(expiredResponse.status()),
        `Expired token was accepted: ${expiredResponse.status()}`,
      );
      const deletedCrossOrigin = await context.request.delete(
        `${localOrigin}/api/auth/session`,
        {
          headers: { Origin: "https://untrusted.invalid" },
        },
      );
      assert.equal(deletedCrossOrigin.status(), 403);
      assert.equal((await api("/api/account")).status(), 200);
      const accepted = await api("/api/auth/session", "POST", {
        idToken: valid.idToken,
      });
      assert.ok(
        accepted.ok(),
        `Same-origin session exchange failed: ${accepted.status()}`,
      );
      const exchanged = await assertAccountShape(qaUsers.photographerA, false);
      assert.equal(exchanged.user.emailVerified, true);
      const clear = await api("/api/auth/session", "DELETE");
      assert.ok(
        clear.ok(),
        `Same-origin session clear failed: ${clear.status()}`,
      );
      assert.equal((await accountSnapshot()).body.user, null);
    },
  );

  await check(
    "Registration and email verification use emulator OOB codes",
    async () => {
      const email = `auth-qa-${emailSuffix}`;
      await page.goto(`${localOrigin}/sign-in`);
      await waitForAuthReady();
      await page
        .getByRole("button", { name: "Create an account", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Create your account" })
        .waitFor();
      await page.getByRole("textbox", { name: "Email address" }).fill(email);
      await page.getByLabel("Display name").fill("Auth QA Signup");
      await page.getByLabel("Password").fill(password);
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page.waitForURL(
        (url) =>
          url.pathname === "/account" &&
          url.searchParams.get("verify_email") === "1",
        { timeout: 30000 },
      );
      await page.getByText(/Your email address is not verified yet/i).waitFor();
      assert.equal((await accountSnapshot()).body.user.emailVerified, false);
      await page
        .getByRole("button", { name: "Resend verification", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Verification email sent." })
        .waitFor();
      const code = await getOobCode(email, "VERIFY_EMAIL");
      const verified = await emulatorCall(
        `/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
        { oobCode: code },
      );
      assert.ok(
        verified.data.emailVerified,
        "Emulator did not consume verification code",
      );
      await page
        .getByRole("button", { name: "I’ve verified", exact: true })
        .click();
      await page.getByText(/^Email verified\./).waitFor({ timeout: 30000 });
      await page.waitForFunction(
        async () => {
          const response = await fetch("/api/account", { cache: "no-store" });
          if (!response.ok) return false;
          const snapshot = await response.json();
          return snapshot.user?.emailVerified === true;
        },
        { timeout: 30000 },
      );
      assert.equal((await accountSnapshot()).body.user.emailVerified, true);
    },
  );

  await check(
    "Password reset response is neutral and emulator reset code changes the credential",
    async () => {
      const email = `auth-qa-${emailSuffix}`;
      const nextPassword = `${password}Reset`;
      await signOutThroughUI();
      await page.goto(`${localOrigin}/sign-in`);
      await waitForAuthReady();
      await page
        .getByRole("button", { name: "Forgot password?", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Reset your password" })
        .waitFor();
      await page.getByRole("textbox", { name: "Email address" }).fill(email);
      await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({
          hasText:
            "If an account exists for that email, a password reset link is on its way.",
        })
        .waitFor();
      const code = await getOobCode(email, "PASSWORD_RESET");
      const reset = await emulatorCall(
        `/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake-api-key`,
        { oobCode: code, newPassword: nextPassword },
      );
      assert.ok(reset.data.email, "Emulator did not consume reset code");
      assert.match(
        (await signInToken(email, password)).data.error?.message || "",
        /^INVALID_(?:PASSWORD|LOGIN_CREDENTIALS)$/,
      );
      assert.ok(
        (await signInToken(email, nextPassword)).idToken,
        "The reset password did not authenticate",
      );
    },
  );

  await check(
    "Google sign-in starts only the emulator-hosted provider flow",
    async () => {
      await page.goto(`${localOrigin}/sign-in`);
      await waitForAuthReady();
      const popupPromise = page
        .waitForEvent("popup", { timeout: 10000 })
        .catch(() => null);
      const googleButton = page.getByRole("button", {
        name: "Continue with Google",
        exact: true,
      });
      await googleButton.click();
      const popup = await popupPromise;
      if (!popup) {
        // The Firebase Web SDK may request its Google helper script before it
        // reaches the local emulator popup. External access stays blocked; wait
        // for a visible, recoverable Auth error instead of treating no popup as
        // a successful provider flow.
        const recovery = await Promise.race([
          page
            .getByRole("alert")
            .waitFor({ timeout: 20000 })
            .then(() => "visible-error")
            .catch(() => "timeout"),
          page
            .waitForFunction(
              () => {
                const button = document.querySelector(".auth-google");
                return (
                  button instanceof HTMLButtonElement &&
                  !button.disabled &&
                  Boolean(document.querySelector('[role="alert"]'))
                );
              },
              { timeout: 20000 },
            )
            .then(() => "recovered-button")
            .catch(() => "timeout"),
        ]);
        const alertText = await page.getByRole("alert").allTextContents();
        assert.equal(
          recovery === "visible-error" || recovery === "recovered-button",
          true,
          "Blocked Google loading must finish with a recoverable UI error",
        );
        assert.ok(
          alertText.some((text) => text.trim().length > 0),
          "Google loading failure must be announced to the user",
        );
        return {
          skipped: true,
          reason:
            "The emulator Google popup did not open because the Google helper script was blocked; a recoverable error was shown. Provider authentication was not exercised.",
          outcome: "blocked-before-emulator-popup",
          recoverableError: alertText.join(" ").trim(),
          scope: "local emulator only; live Google not tested",
        };
      }
      await popup
        .waitForLoadState("domcontentloaded", { timeout: 15000 })
        .catch(() => {});
      const popupUrl = new URL(popup.url());
      assert.equal(
        popupUrl.origin,
        authOrigin,
        `Google provider popup escaped emulator: ${popupUrl.origin}`,
      );
      await popup.close();
      return {
        skipped: true,
        reason:
          "The emulator-hosted provider popup opened, but no test identity was completed; provider authentication was not exercised.",
        outcome: "emulator-popup-opened-but-not-authenticated",
        scope: "local emulator only; live Google not tested",
      };
    },
  );

  await check(
    "Logout clears the Firebase-backed server session and account menu",
    async () => {
      await signInThroughForm(qaUsers.photographerA.email);
      await page.goto(`${localOrigin}/account`);
      await page.getByRole("link", { name: "Sign out", exact: true }).click();
      await page.waitForURL(
        (url) =>
          url.pathname === "/account" &&
          url.searchParams.get("signed_out") === "1",
        { timeout: 30000 },
      );
      await page
        .getByRole("heading", { name: "Sign in to continue" })
        .waitFor();
      const { body } = await accountSnapshot();
      assert.equal(body.user, null);
      assert.equal(body.sessionKey, null);
      assert.ok(
        (await page
          .getByRole("link", { name: "Sign in", exact: true })
          .count()) >= 1,
      );
    },
  );

  assert.deepEqual(
    blockedRequests,
    [],
    `Browser attempted non-local network requests: ${JSON.stringify(blockedRequests)}`,
  );
  assert.deepEqual(
    pageErrors,
    [],
    `Browser runtime errors: ${JSON.stringify(pageErrors)}`,
  );
}

try {
  await main();
} catch (error) {
  results.push({
    name: "harness",
    status: "failed",
    error: String(error?.stack || error),
  });
  console.error(`FAIL harness: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await mkdir("docs/evidence", { recursive: true });
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        qaOrigin: localOrigin,
        authEmulator: authOrigin,
        firebaseProject: projectId,
        scope:
          "Local browser + Firebase Auth Emulator only. No production or live Google identity tested.",
        results,
        blockedRequests,
        expectedBlockedRequests,
        pageErrors,
      },
      null,
      2,
    ) + "\n",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  const passed = results.filter((result) => result.status === "passed").length;
  const skipped = results.filter(
    (result) => result.status === "skipped",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  console.log(
    `Result: ${passed} passed, ${skipped} skipped, ${failed} failed; ${expectedBlockedRequests.length} Google SDK script request(s) blocked before network access.`,
  );
  console.log(`Evidence: ${evidencePath}`);
}
