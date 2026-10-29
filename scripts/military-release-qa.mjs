// Military batch release against the client's 31-question sheet: release checks, sample Trips and
// staff-only access. The sheet has six Trainee questions, so a release is refused until the client
// supplies more; the release, activate and restore writes are covered by tests/editorial-store.test.mjs.
// Local only: run against `npm run demo:preview` with the Auth Emulator seeded. Writes only local D1 and
// local photo storage. Prepares all 31 packages with distinct generated QA photographs (reused across runs).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:5186");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "QA_ORIGIN must use a loopback host");
const origin = target.origin;
const password = "LocalPreview-2026!";
const config = await (await fetch(origin + "/api/auth/config")).json();
assert.equal(config.config?.projectId, "demo-airplane-games", "must target the local emulator project");
const shots = process.env.QA_SHOTS || "outputs/military-release-qa";
await mkdir(shots, { recursive: true });
const { clientContent, militaryRoster, militaryStages } = await import("../lib/military.ts");

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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await context.newPage();
admin.on("pageerror", (e) => errors.push(e.message));
await signIn(admin, "/admin/sign-in", "seedy@sites.test");
await admin.locator(".admin-app").waitFor({ timeout: 180000 });

/** The signed-in context's cookie, with the Origin header the server's same-origin check expects. */
async function api(method, path, data) {
  const r = await context.request.fetch(origin + path, { method, headers: { Origin: origin }, data });
  return { status: r.status(), body: await r.json().catch(() => ({})) };
}

// One distinct generated photograph per sheet row, submitted and approved once, then reused.
// Fixtures from earlier runs are adopted first, because contributors are limited to 30 uploads a day.
const title = (a) => `Military release QA · ${a.id} · ${a.name}`;
let mine = (await api("GET", "/api/admin/submissions")).body.submissions ?? [];
const fixtureFor = new Map();
const own = new Set(militaryRoster.map(title));
const spare = mine.filter((s) => s.data.title.startsWith("Military release QA · ") && !own.has(s.data.title));
for (const aircraft of militaryRoster) {
  const s = mine.find((item) => item.data.title === title(aircraft)) ?? spare.shift();
  if (s) fixtureFor.set(aircraft.id, s.id);
}
for (const [i, aircraft] of militaryRoster.entries()) {
  if (fixtureFor.has(aircraft.id)) continue;
  const jpeg = await admin.evaluate(([i, name]) => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 800, height: 600 });
    const g = canvas.getContext("2d");
    g.fillStyle = `hsl(${i * 11} 45% 40%)`;
    g.fillRect(0, 0, 800, 600);
    g.fillStyle = "#fff";
    g.font = "bold 32px sans-serif";
    g.fillText(`QA ${i + 1}: ${name}`, 40, 300);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }, [i, aircraft.name]);
  const payload = {
    title: title(aircraft), photographer: "QA Fixture", email: "qa@sites.test",
    portfolio: "https://example.org/qa", category: "aircraft", customCategory: "",
    targetGames: ["aircraft-identifier"], aircraft: aircraft.name, airline: "", registration: "",
    location: "Local test only", airportCode: "", capturedOn: "",
    description: "Generated local QA fixture for the Military release check. Not a real photograph.",
    factualSource: "https://www.af.mil/About-Us/Fact-Sheets/", credit: "QA Fixture",
    rightsBasis: "owner", rightsEvidence: "Local QA fixture created by the test suite.",
    channels: ["games"], imageOrigin: "camera", consent: true,
  };
  const r = await context.request.post(origin + "/api/submissions", {
    headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
    multipart: {
      data: JSON.stringify(payload),
      photo: { name: `qa-${aircraft.id}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") },
    },
  });
  assert.ok([200, 201].includes(r.status()), `fixture upload ${aircraft.id}: ${r.status()} ${await r.text()}`);
}
mine = (await api("GET", "/api/admin/submissions")).body.submissions;
const allChecks = { identity: true, quality: true, credit: true, rights: true, category: true };
const photoFor = new Map();
for (const aircraft of militaryRoster) {
  const s = mine.find((item) => item.id === fixtureFor.get(aircraft.id) || item.data.title === title(aircraft));
  if (s.status !== "approved") {
    const r = await api("PATCH", `/api/admin/submissions/${s.id}`, {
      status: "approved", note: "", checks: allChecks, version: s.version,
    });
    assert.equal(r.status, 200, `approve fixture ${aircraft.id}: ${JSON.stringify(r.body)}`);
  }
  photoFor.set(aircraft.id, s.id);
}

// The server stores the client's answers, so the fixture is built in the same normalized form.
const full = (aircraft) => clientContent(aircraft, {
  photoSource: "submission", submissionId: photoFor.get(aircraft.id), licenseUrl: "",
  permission: "Local QA fixture created by the test suite.", attribution: "QA Fixture",
  referenceUrl: "https://www.af.mil/About-Us/Fact-Sheets/", answer: "", aliases: [],
  distractors: [], hint: "", reveal: "", notes: "",
  checklist: { identity: true, answers: true, crop: true, clipperCard: true },
});
/** Walks a package one stage at a time to `goal`, stepping an approved one back first if its data differs. */
async function prepare(aircraft, goal = "approved") {
  const data = full(aircraft);
  let p = (await api("GET", "/api/admin/military")).body.packages.find((x) => x.aircraftId === aircraft.id);
  let stage = p?.stage ?? "missing_photo", version = p?.version ?? 0;
  const put = async (to) => {
    const r = await api("PUT", `/api/admin/military/${aircraft.id}`, { stage: to, data, version });
    assert.equal(r.status, 200, `${aircraft.id} → ${to}: ${JSON.stringify(r.body)}`);
    ({ stage, version } = r.body.package);
  };
  if (stage === goal && JSON.stringify(p.data) === JSON.stringify(data)) return;
  if (stage === "approved") await put("previewed");
  while (militaryStages.indexOf(stage) < militaryStages.indexOf(goal))
    await put(militaryStages[militaryStages.indexOf(stage) + 1]);
  if (militaryStages.indexOf(stage) > militaryStages.indexOf(goal)) await put(goal);
}
for (const aircraft of militaryRoster) await prepare(aircraft);

const open = async () => {
  await admin.reload();
  await admin.locator(".admin-app").waitFor({ timeout: 180000 });
  await admin.getByRole("button", { name: "Military readiness" }).click();
  await admin.getByRole("heading", { name: "Batch release" }).waitFor();
};
const state = async () => (await api("GET", "/api/admin/military")).body;
const basisOf = (s) => s.packages.map((p) => `${p.aircraftId}:${p.version}`).sort().join(",");
const traineeShort =
  "Trainee: a Trip needs 10 approved questions at this rank or below; 6 are in the client's sheet.";
await open();

await check("all 31 approved with distinct photos: only the short Trainee Trip blocks release", async () => {
  const listed = await admin.locator(".military-release .military-missing li").allTextContents();
  assert.deepEqual(listed, [traineeShort]);
  const now = await state();
  const refused = await api("POST", "/api/admin/military/releases", {
    basis: basisOf(now), previewed: true, pointerVersion: now.pointer.version,
  });
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.body.errors, [traineeShort]);
  assert.equal(await admin.getByRole("button", { name: /^(Release batch|Already released)$/ }).isDisabled(), true);
});

await check("sample Trips deal ten questions at each rank that can fill one, with photographs", async () => {
  const confirm = admin.getByLabel("I reviewed the sample Trip for every rank");
  await admin.getByRole("button", { name: "Preview sample Trips" }).click();
  const trips = admin.locator(".military-trip");
  assert.equal(await trips.count(), 5);
  assert.match(await trips.nth(0).locator("summary").textContent(), /Trainee.*Needs 10 approved questions/);
  assert.equal(await confirm.isDisabled(), true, "every rank must have a sample before review");
  for (let i = 1; i < 5; i++) {
    await trips.nth(i).locator("summary").click();
    assert.equal(await trips.nth(i).locator("li").count(), 10);
  }
  const chief = await trips.nth(4).locator("li b").allTextContents();
  for (const name of ["Rockwell B-1B Lancer", "Chengdu FT-7BGI", "Grumman TBF / TBM Avenger"])
    assert.ok(chief.includes(name), name);
  const b1 = await trips.nth(4).locator("li", { hasText: "Rockwell B-1B Lancer" }).locator("small").first().textContent();
  assert.deepEqual(b1.split(" · ").sort(),
    ["General Dynamics F-111", "Rockwell B-1B Lancer", "Tupolev Tu-160", "Tupolev Tu-22M"],
    "options are the client's answer and wrong answers");
  const img = trips.nth(1).locator("li img").first();
  await img.scrollIntoViewIfNeeded();
  await admin.waitForFunction((el) => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 30000 });
  const before = await trips.nth(1).locator("li b").allTextContents();
  await admin.getByRole("button", { name: "Shuffle samples" }).click();
  assert.notDeepEqual(await trips.nth(1).locator("li b").allTextContents(), before, "shuffle draws a new sample");
  await admin.screenshot({ path: `${shots}/military-release-desktop.png`, fullPage: true });
});

await check("unreviewed, stale and mismatched release requests are refused", async () => {
  const now = await state();
  const basis = basisOf(now);
  assert.equal((await api("POST", "/api/admin/military/releases", {
    basis, previewed: false, pointerVersion: now.pointer.version,
  })).status, 422);
  assert.equal((await api("POST", "/api/admin/military/releases", {
    basis: basis + "x", previewed: true, pointerVersion: now.pointer.version,
  })).status, 409, "a basis other than the previewed versions is refused");
  assert.equal((await api("POST", "/api/admin/military/releases", {
    basis, previewed: true, pointerVersion: now.pointer.version + 7,
  })).status, 409, "a stale release pointer is refused");
});

await check("a photograph withdrawn from game use is named by the server's release check", async () => {
  const aircraft = militaryRoster[1];
  const id = photoFor.get(aircraft.id);
  const s = (await api("GET", "/api/admin/submissions")).body.submissions.find((x) => x.id === id);
  assert.equal((await api("PATCH", `/api/admin/submissions/${id}`, {
    status: "changes_requested", note: "QA: temporarily withdrawn from game use.", checks: s.checks, version: s.version,
  })).status, 200);
  const now = await state();
  const blocked = await api("POST", "/api/admin/military/releases", {
    basis: basisOf(now), previewed: true, pointerVersion: now.pointer.version,
  });
  assert.equal(blocked.status, 422);
  assert.ok(blocked.body.errors.some((e) => e.startsWith(`${aircraft.name} (${aircraft.rank}):`)), JSON.stringify(blocked.body));
  const back = (await api("GET", "/api/admin/submissions")).body.submissions.find((x) => x.id === id);
  assert.equal((await api("PATCH", `/api/admin/submissions/${id}`, {
    status: "approved", note: "", checks: allChecks, version: back.version,
  })).status, 200);
});

await check("phone width: release panel and sample Trips fit without horizontal overflow", async () => {
  await open();
  for (const [width, theme] of [[390, "dark"], [320, "light"]]) {
    await admin.setViewportSize({ width, height: 900 });
    await admin.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    const show = admin.getByRole("button", { name: "Preview sample Trips" });
    if (await show.count()) await show.click();
    await admin.locator(".military-trip").nth(1).evaluate((d) => { d.open = true; });
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
    await admin.locator(".military-release").screenshot({ path: `${shots}/military-release-${theme}-${width}.png` });
  }
  await admin.setViewportSize({ width: 1440, height: 1000 });
});

await check("anonymous and non-staff accounts cannot release or restore", async () => {
  assert.equal((await fetch(origin + "/api/admin/military/releases", { method: "POST", headers: { Origin: origin } })).status, 401);
  const other = await browser.newContext();
  const page = await other.newPage();
  await signIn(page, "/sign-in?as=photographer", "photographer-a@sites.test");
  await page.waitForURL((u) => u.pathname !== "/sign-in", { timeout: 60000, waitUntil: "commit" });
  for (const path of ["/api/admin/military/releases", "/api/admin/military/releases/restore"]) {
    const r = await other.request.post(origin + path, { headers: { Origin: origin }, data: { pointerVersion: 0 } });
    assert.equal(r.status(), 403, path);
  }
  await other.close();
});

await browser.close();
if (errors.length) results.push(`FAIL page errors: ${errors.join(" | ")}`);
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
