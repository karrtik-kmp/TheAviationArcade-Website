import { pathToFileURL } from "node:url";
import path from "node:path";
export const demoPassword = "LocalPreview-2026!";
export const demoAuthUsers = [
  { email: "seedy@sites.test", displayName: "Local QA Editor" },
  { email: "photographer-a@sites.test", displayName: "Photographer A" },
  { email: "photographer-b@sites.test", displayName: "Photographer B" },
];
const emulator = "http://127.0.0.1:9099",
  project = "demo-airplane-games";
async function call(action, body) {
  const response = await fetch(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message || "Local Auth emulator request failed.",
    );
  return data;
}
export async function seedAuthDemoUsers() {
  for (const user of demoAuthUsers) {
    let created;
    try {
      created = await call("signUp", {
        email: user.email,
        password: demoPassword,
        returnSecureToken: true,
      });
    } catch (error) {
      if (error.message !== "EMAIL_EXISTS") throw error;
      created = await call("signInWithPassword", {
        email: user.email,
        password: demoPassword,
        returnSecureToken: true,
      });
    }
    await call("update", {
      idToken: created.idToken,
      displayName: user.displayName,
    });
    const fresh = await call("signInWithPassword", {
      email: user.email,
      password: demoPassword,
      returnSecureToken: true,
    });
    const record = await call("lookup", { idToken: fresh.idToken });
    if (!record.users?.[0]?.emailVerified) {
      await call("sendOobCode", {
        idToken: fresh.idToken,
        requestType: "VERIFY_EMAIL",
      });
      const response = await fetch(
        `${emulator}/emulator/v1/projects/${project}/oobCodes`,
      );
      const body = await response.json();
      const code = body.oobCodes
        ?.filter(
          (entry) =>
            entry.email === user.email && entry.requestType === "VERIFY_EMAIL",
        )
        .at(-1)?.oobCode;
      if (!code) throw new Error("Local verification code was not generated.");
      await call("update", { oobCode: code });
    }
  }
}
export async function signInDemoEditor(
  page,
  origin = "http://127.0.0.1:5173",
  returnTo = "/admin",
) {
  const url = new URL(origin);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Demo sign-in is loopback-only.");
  await seedAuthDemoUsers();
  await page.goto(
    `${origin}/sign-in?return_to=${encodeURIComponent(returnTo)}`,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(demoAuthUsers[0].email);
  await page.getByLabel("Password", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === new URL(returnTo, origin).pathname,
    { timeout: 90000 },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  seedAuthDemoUsers()
    .then(() =>
      console.log(
        `Local demo accounts ready at ${emulator}:\n${demoAuthUsers.map((user) => user.email).join("\n")}\nLocal-only password: ${demoPassword}`,
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
