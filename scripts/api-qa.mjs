import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
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
try {
  const loginPage = await context.newPage();
  await signInDemoEditor(loginPage, origin);
  await context.request.post(origin + "/api/admin/demo", {
    headers: { Origin: origin },
    data: {},
  });
  const list = await context.request.get(origin + "/api/admin/submissions");
  assert.equal(list.status(), 200);
  const body = await list.json();
  const sample = body.submissions.find(
    (s) => s.id === "demo-submission-aircraft",
  );
  assert.ok(sample);
  const title = "Replay QA fixture " + Date.now(),
    key = crypto.randomUUID();
  const file = await readFile("public/media/aircraft.jpg");
  const payload = {
    ...sample.data,
    title,
    location: "Local test only",
    consent: true,
  };
  const send = () =>
    context.request.post(origin + "/api/submissions", {
      headers: { Origin: origin, "Idempotency-Key": key },
      multipart: {
        data: JSON.stringify(payload),
        photo: { name: "qa.jpg", mimeType: "image/jpeg", buffer: file },
      },
    });
  const responses = await Promise.all([send(), send()]);
  const decoded = await Promise.all(responses.map((r) => r.json()));
  assert.ok(responses.every((r) => [200, 201].includes(r.status())));
  assert.equal(decoded[0].submission.id, decoded[1].submission.id);
  const replay = await send();
  assert.equal(replay.status(), 200);
  assert.equal((await replay.json()).submission.id, decoded[0].submission.id);
  const after = await (
    await context.request.get(origin + "/api/submissions")
  ).json();
  assert.equal(
    after.submissions.filter((s) => s.data.title === title).length,
    1,
  );
  const photo = await context.request.get(
    origin + decoded[0].submission.photoUrl,
  );
  assert.equal(photo.status(), 200);
  assert.match(photo.headers()["cache-control"], /no-store/);
  const badZone = await context.request.get(
    origin + "/api/featured?timeZone=bad-zone",
  );
  assert.equal(badZone.status(), 422);
  assert.match((await badZone.json()).error, /timezone/i);
  const page = await context.newPage();
  await page.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Good to have you back." }).waitFor();
  await page.screenshot({
    path: "docs/evidence/admin-overview-light.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(origin + "/contribute", { waitUntil: "domcontentloaded" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "docs/evidence/contributor-mobile-light.png",
    fullPage: true,
  });
  await writeFile(
    "docs/evidence/api-qa.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        concurrentCreate: "one record, both requests accepted",
        replay: "same record returned",
        storedPhoto: "available after race",
        badTimezone: 422,
        privateCache: "no-store",
        adminLightOverflow: false,
        contributor360Overflow: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS concurrent idempotency, photo retention, invalid timezone, light admin and 360px contributor layout",
  );
} finally {
  await browser.close();
}
