// Military readiness desk: roster, stage gating, versioned writes and staff-only access.
// Local only: run against `npm run demo:preview` with the Auth Emulator seeded. Writes only local D1.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { militaryRoster } = await import("../lib/military.ts");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:5186");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "QA_ORIGIN must use a loopback host");
const origin = target.origin;
const password = "LocalPreview-2026!";
const config = await (await fetch(origin + "/api/auth/config")).json();
assert.equal(config.config?.projectId, "demo-airplane-games", "must target the local emulator project");
const shots = process.env.QA_SHOTS || "outputs/military-qa";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
const results = [];
const errors = [];
async function check(name, run) {
  try { await run(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message.split("\n").slice(0, 3).join(" / ")}`); }
}
async function signIn(page, path, email) {
  await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
/** Calls the API from the signed-in page, so the browser supplies the cookie and Origin. */
const api = (page, method, path, body) =>
  page.evaluate(async ({ method, path, body }) => {
    const r = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { method, path, body });

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await context.newPage();
admin.on("pageerror", (e) => errors.push(e.message));
await signIn(admin, "/admin/sign-in", "seedy@sites.test");
await admin.locator(".admin-app").waitFor({ timeout: 180000 });

// Reset the fixture aircraft to an empty Missing photo package so the run is repeatable.
const blank = (answer) => ({
  photoSource: "", submissionId: "", licenseUrl: "", permission: "", attribution: "",
  referenceUrl: "", answer, aliases: [], distractors: ["", "", ""], hint: "", reveal: "", notes: "",
  checklist: { identity: false, answers: false, crop: false, clipperCard: false },
});
for (const [id, name] of [["f-16-fighting-falcon", "F-16 Fighting Falcon"], ["f-15-eagle", "F-15 Eagle"]]) {
  const list = await api(admin, "GET", "/api/admin/military");
  const existing = list.body.packages?.find((p) => p.aircraftId === id);
  if (existing) {
    const r = await api(admin, "PUT", `/api/admin/military/${id}`, {
      stage: "missing_photo", data: blank(name), version: existing.version,
    });
    assert.equal(r.status, 200, "fixture reset");
  }
}
// Other suites (military-release-qa) may leave the rest of the roster approved, so coverage is
// compared with the stored state rather than an empty database.
const trainee = militaryRoster.filter((a) => a.rank === "Trainee").map((a) => a.id);
const traineeAt = async (stage) => {
  const { packages } = (await api(admin, "GET", "/api/admin/military")).body;
  return trainee.filter((id) => (packages.find((p) => p.aircraftId === id)?.stage ?? "missing_photo") === stage).length;
};
const missingAtStart = await traineeAt("missing_photo");
await admin.reload();
await admin.locator(".admin-app").waitFor({ timeout: 180000 });
await admin.getByRole("button", { name: "Military readiness" }).click();

await check("roster shows 30 aircraft grouped by the five ranks with coverage", async () => {
  await admin.getByRole("heading", { name: "Military readiness" }).waitFor();
  assert.equal(await admin.locator(".military-roster .admin-record").count(), 30);
  assert.deepEqual(
    await admin.locator(".military-rank-head").allTextContents(),
    ["Trainee", "First Officer", "Captain", "Check Airman", "Chief Pilot"],
  );
  const trainee = await admin.locator(".military-table tbody tr").first().locator("td").allTextContents();
  assert.equal(trainee[0], String(missingAtStart), "Trainee missing-photo count matches stored packages");
});

await check("advancing is blocked until the stage's evidence is recorded", async () => {
  await admin.getByRole("button", { name: /F-16 Fighting Falcon/ }).click();
  const advance = admin.getByRole("button", { name: "Mark Rights checked" });
  assert.equal(await advance.isDisabled(), true);
  await admin.locator(".military-missing").getByText("Choose where the photograph comes from.").waitFor();
});

await check("a package moves through every stage to approval and locks", async () => {
  await admin.getByLabel("Photograph source").selectOption("licensed");
  await admin.getByLabel("License or source (https://)").fill("https://example.org/license/f16");
  await admin.getByLabel("Attribution").fill("Example Photo Agency");
  await admin.getByLabel("Permission or license terms").fill("Licensed for in-game use, worldwide, QA fixture.");
  await admin.getByRole("button", { name: "Mark Rights checked" }).click();
  await admin.getByText("F-16 Fighting Falcon saved as rights checked.").waitFor();

  await admin.getByLabel("Identity reference (https://)").fill("https://www.af.mil/About-Us/Fact-Sheets/");
  await admin.getByLabel("Accepted aliases (comma separated)").fill("F-16, Viper");
  assert.equal(await admin.getByLabel("Accepted aliases (comma separated)").inputValue(), "F-16, Viper");
  await admin.getByLabel("Wrong answer 1").fill("F-15 Eagle");
  await admin.getByLabel("Wrong answer 3").fill("JF-17 Thunder");
  await admin.getByText("Provide three wrong answers.").waitFor();
  await admin.getByLabel("Wrong answer 2").fill("viper");
  await admin.getByText("Wrong answers must differ", { exact: false }).waitFor();
  await admin.getByLabel("Wrong answer 2").fill("Dassault Mirage 2000");
  await admin.getByLabel("Hint").fill("Single engine, bubble canopy");
  await admin.getByLabel("Reveal explanation").fill("The ventral intake and single tail identify the F-16.");
  await admin.getByRole("button", { name: "Mark Content prepared" }).click();
  await admin.getByText("saved as content prepared.").waitFor();

  await admin.getByLabel("Mobile crop shows the aircraft fairly").check();
  await admin.getByRole("button", { name: "Mark Previewed" }).click();
  await admin.getByText("saved as previewed.").waitFor();
  for (const label of [
    "Aircraft identity matches the reference",
    "Wrong answers are plausible and unambiguous",
    "Military Clipper Card mapping is correct",
  ]) await admin.getByLabel(label).check();
  await admin.getByRole("button", { name: "Approve package" }).click();
  await admin.getByText("F-16 Fighting Falcon approved. Nothing was published").waitFor();
  assert.equal(await admin.getByLabel("Hint").isDisabled(), true, "approved fields lock");
  const approved = await traineeAt("approved");
  const row = await admin.locator(".military-table tbody tr").first().locator("td").allTextContents();
  assert.equal(row[4], String(approved), "coverage counts the newly approved Trainee aircraft");
  assert.equal(row[5], `${approved} / 14`);
  await admin.screenshot({ path: `${shots}/military-desktop-light.png`, fullPage: true });
});

await check("server rejects skipped stages, stale versions, unknown aircraft and edits to approved packages", async () => {
  const list = await api(admin, "GET", "/api/admin/military");
  const f16 = list.body.packages.find((p) => p.aircraftId === "f-16-fighting-falcon");
  assert.equal(f16.stage, "approved");
  const f15 = list.body.packages.find((p) => p.aircraftId === "f-15-eagle");
  const skip = await api(admin, "PUT", "/api/admin/military/f-15-eagle", {
    stage: "approved", data: f16.data, version: f15?.version ?? 0,
  });
  assert.equal(skip.status, 422);
  assert.match(skip.body.error, /Rights checked/);
  const stale = await api(admin, "PUT", "/api/admin/military/f-16-fighting-falcon", {
    stage: "approved", data: f16.data, version: f16.version - 1,
  });
  assert.equal(stale.status, 409);
  const edit = await api(admin, "PUT", "/api/admin/military/f-16-fighting-falcon", {
    stage: "approved", data: { ...f16.data, hint: "Changed after approval" }, version: f16.version,
  });
  assert.equal(edit.status, 422);
  assert.equal((await api(admin, "PUT", "/api/admin/military/sukhoi-su-27", {
    stage: "missing_photo", data: f16.data, version: 0,
  })).status, 404);
  assert.equal((await api(admin, "PUT", "/api/admin/military/f-15-eagle", {
    stage: "rights_checked", data: { ...f16.data, photoSource: "submission", submissionId: "demo-submission-aircraft" }, version: f15?.version ?? 0,
  })).status >= 404, true, "demo or unapproved submissions cannot supply rights");
});

await check("military packages stay out of the Identifier/POTD desks and are audited", async () => {
  const content = await api(admin, "GET", "/api/admin/content");
  assert.ok(content.body.records.every((r) => r.kind === "identifier" || r.kind === "potd"));
  const audit = await api(admin, "GET", "/api/admin/audit");
  assert.ok(audit.body.events.some((e) => e.action === "military_approved" && e.entity_id === "military-f-16-fighting-falcon"));
});

await check("stepping back unlocks an approved package", async () => {
  await admin.getByRole("button", { name: "Step back to Previewed" }).click();
  await admin.getByText("saved as previewed.").waitFor();
  assert.equal(await admin.getByLabel("Hint").isDisabled(), false);
});

await check("phone width: no horizontal overflow, editor replaces the roster", async () => {
  for (const [width, theme] of [[390, "dark"], [320, "light"]]) {
    await admin.setViewportSize({ width, height: 900 });
    await admin.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await admin.waitForTimeout(300);
    const { overflow, culprits } = await admin.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      culprits: [...document.body.querySelectorAll("*")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 &&
          !el.closest(".admin-table-scroll, .admin-nav"))
        .slice(0, 4)
        .map((el) => `${el.tagName}.${[...el.classList].slice(0, 2).join(".")}`),
    }));
    assert.ok(overflow <= 0, `${width}px overflows by ${overflow}px: ${culprits.join(", ")}`);
    assert.equal(await admin.locator(".military-roster").isVisible(), false);
    await admin.screenshot({ path: `${shots}/military-${theme}-${width}.png`, fullPage: true });
  }
  await admin.setViewportSize({ width: 1440, height: 1000 });
});

await check("anonymous and non-staff accounts are refused", async () => {
  const anonymous = await fetch(origin + "/api/admin/military");
  assert.equal(anonymous.status, 401);
  const other = await browser.newContext();
  const page = await other.newPage();
  await signIn(page, "/sign-in?as=photographer", "photographer-a@sites.test");
  await page.waitForURL((u) => u.pathname !== "/sign-in", { timeout: 60000, waitUntil: "commit" });
  assert.equal((await api(page, "GET", "/api/admin/military")).status, 403);
  assert.equal((await api(page, "PUT", "/api/admin/military/f-15-eagle", { stage: "missing_photo", data: {}, version: 0 })).status, 403);
  await other.close();
});

await browser.close();
if (errors.length) results.push(`FAIL page errors: ${errors.join(" | ")}`);
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
