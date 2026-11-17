import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { signInQaEditor } from "./seed-auth-emulator.mjs";
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
  const page = await context.newPage();
  await signInQaEditor(page, origin);
  // The Admin is its own repo and host (decision I-1): no admin API here, even for staff.
  assert.equal(
    (await context.request.get(origin + "/api/admin/submissions")).status(),
    404,
  );
  // D-2 amended 11-04: member D1 submission routes are closed in every mode.
  const closed = async (res, label) => {
    assert.equal(res.status(), 404, label);
    assert.equal((await res.json()).code, "SUBMISSIONS_CLOSED", label);
  };
  const sample = { title: "QA proposal", consent: true };
  await closed(
    await context.request.get(origin + "/api/submissions"),
    "member list closed",
  );
  await closed(
    await context.request.post(origin + "/api/submissions", {
      headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
      multipart: {
        data: JSON.stringify(sample),
        photo: {
          name: "qa.jpg",
          mimeType: "image/jpeg",
          buffer: await readFile("public/media/aircraft.jpg"),
        },
      },
    }),
    "member create closed",
  );
  await closed(
    await context.request.put(origin + "/api/submissions/qa-proposal", {
      headers: { Origin: origin },
      multipart: { data: JSON.stringify(sample) },
    }),
    "member revise closed",
  );
  const badZone = await context.request.get(
    origin + "/api/featured?timeZone=bad-zone",
  );
  assert.equal(badZone.status(), 422);
  assert.match((await badZone.json()).error, /timezone/i);
  await page.goto(origin + "/account", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "My account" }).waitFor();
  await page.screenshot({
    path: "docs/evidence/account-light.png",
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
  await page
    .getByRole("heading", { name: "Photo submissions aren't open yet" })
    .waitFor();
  await page.screenshot({
    path: "docs/evidence/contributor-mobile-light.png",
    fullPage: true,
  });
  await writeFile(
    "docs/evidence/api-qa.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        adminApi: 404,
        memberSubmissionRoutes: "404 SUBMISSIONS_CLOSED",
        contributeClosedPanel: true,
        badTimezone: 422,
        accountLightOverflow: false,
        contributor360Overflow: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS no admin API, closed member submission routes, closed /contribute panel, invalid timezone, light account and 360px contributor layout",
  );
} finally {
  await browser.close();
}
