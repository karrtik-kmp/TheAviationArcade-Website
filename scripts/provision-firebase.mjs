import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot, runFirebase } from "./firebase-cli.mjs";

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_APP_NAME = "Airplane Games Website";

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project-id" || arg === "--support-email") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg === "--project-id" ? "projectId" : "supportEmail"] =
        value.trim();
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function unwrapJson(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "result" in value
  ) {
    if (value.status === "error")
      throw new Error("Firebase CLI returned an error.");
    return value.result;
  }
  return value;
}

function parseCliJson(output, description) {
  const text = output.trim();
  if (!text)
    throw new Error(`Firebase CLI returned no JSON for ${description}.`);
  try {
    return unwrapJson(JSON.parse(text));
  } catch (firstError) {
    // Some CLI releases print a short status line before their JSON result.
    for (const marker of ["{", "["]) {
      const start = text.indexOf(marker);
      if (start < 0) continue;
      try {
        return unwrapJson(JSON.parse(text.slice(start)));
      } catch {
        // Try the next JSON object marker.
      }
    }
    throw new Error(`Could not read Firebase CLI JSON for ${description}.`);
  }
}

async function firebase(args, { json = false } = {}) {
  const result = await runFirebase(json ? [...args, "--json"] : args, {
    capture: json,
  });
  if (result.code !== 0) {
    throw new Error(
      `Firebase CLI command failed (${args[0]}). Check the CLI output and account permissions.`,
    );
  }
  return json ? parseCliJson(result.stdout, args[0]) : null;
}

function emailFromAccount(account) {
  const user =
    account?.user && typeof account.user === "object" ? account.user : account;
  return typeof user?.email === "string"
    ? user.email.trim().toLowerCase()
    : null;
}

async function activeCliEmail() {
  const result = await firebase(["login:list"], { json: true });
  const accounts = Array.isArray(result)
    ? result
    : Array.isArray(result?.users)
      ? result.users
      : Array.isArray(result?.accounts)
        ? result.accounts
        : [];
  const email = accounts.length ? emailFromAccount(accounts[0]) : null;
  if (!email) {
    throw new Error(
      "No Firebase CLI account is active. Run `node scripts/firebase-cli.mjs login --no-localhost` first.",
    );
  }
  return email;
}

async function listProjects() {
  const result = await firebase(["projects:list"], { json: true });
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.projects)) return result.projects;
  throw new Error("Firebase CLI project list had an unexpected format.");
}

async function ensureProject(projectId) {
  const existing = (await listProjects()).find(
    (project) => project?.projectId === projectId,
  );
  if (existing) return existing.projectId;

  await firebase(
    ["projects:create", projectId, "--display-name", "Airplane Games"],
    { json: true },
  );
  const created = (await listProjects()).find(
    (project) => project?.projectId === projectId,
  );
  if (!created) {
    throw new Error(
      "Firebase project creation returned successfully, but the exact project ID was not visible afterward.",
    );
  }
  return created.projectId;
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
  });
  await rename(temporaryPath, filePath);
}

async function persistProjectAlias(projectId) {
  const filePath = path.join(projectRoot, ".firebaserc");
  let config = {};
  try {
    config = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(
        "The existing .firebaserc is invalid; it was left unchanged.",
      );
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(
      "The existing .firebaserc must contain a JSON object; it was left unchanged.",
    );
  }
  if (
    config.projects !== undefined &&
    (!config.projects ||
      typeof config.projects !== "object" ||
      Array.isArray(config.projects))
  ) {
    throw new Error(
      "The existing .firebaserc projects field is invalid; it was left unchanged.",
    );
  }
  config.projects = { ...(config.projects ?? {}), default: projectId };
  await writeJsonAtomically(filePath, config);
}

async function listWebApps(projectId) {
  const result = await firebase(["apps:list", "WEB", "--project", projectId], {
    json: true,
  });
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.apps)) return result.apps;
  throw new Error("Firebase CLI Web App list had an unexpected format.");
}

async function ensureWebApp(projectId) {
  let apps = await listWebApps(projectId);
  let app = apps.find(
    (candidate) =>
      candidate?.platform === "WEB" && candidate?.displayName === WEB_APP_NAME,
  );
  if (!app && apps.length === 1 && apps[0]?.platform === "WEB") app = apps[0];

  if (!app && apps.length === 0) {
    process.stdout.write(
      `Creating the Firebase Web App "${WEB_APP_NAME}" in ${projectId}.\n` +
        "If the CLI asks to create a Firebase Hosting site, choose No; Hosting is outside this setup.\n",
    );
    await firebase([
      "apps:create",
      "WEB",
      WEB_APP_NAME,
      "--project",
      projectId,
    ]);
    apps = await listWebApps(projectId);
    app = apps.find(
      (candidate) =>
        candidate?.platform === "WEB" &&
        candidate?.displayName === WEB_APP_NAME,
    );
    if (!app && apps.length === 1 && apps[0]?.platform === "WEB") app = apps[0];
  }

  if (!app?.appId) {
    throw new Error(
      "Could not select one Firebase Web App. Keep a single Web App or name it `Airplane Games Website`, then rerun.",
    );
  }
  return app.appId;
}

function findSdkConfig(value) {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.apiKey === "string" &&
    typeof value.authDomain === "string" &&
    typeof value.projectId === "string" &&
    typeof value.appId === "string"
  ) {
    return value;
  }
  for (const nested of Object.values(value)) {
    const found = findSdkConfig(nested);
    if (found) return found;
  }
  return null;
}

async function writeWebConfig(projectId, appId) {
  const response = await firebase(
    ["apps:sdkconfig", "WEB", appId, "--project", projectId],
    { json: true },
  );
  const sdk = findSdkConfig(response);
  if (!sdk || sdk.projectId !== projectId || sdk.appId !== appId) {
    throw new Error(
      "Firebase returned Web App settings that do not match the selected project and app.",
    );
  }
  const output = {
    projectId,
    appId,
    runtimeBindings: {
      FIREBASE_PROJECT_ID: sdk.projectId,
      FIREBASE_WEB_API_KEY: sdk.apiKey,
      FIREBASE_AUTH_DOMAIN: sdk.authDomain,
      FIREBASE_APP_ID: sdk.appId,
    },
    note: "Firebase Web config values are public client settings; do not add tokens or service-account credentials here.",
  };
  const filePath = path.join(
    projectRoot,
    "outputs",
    "firebase-web-config.json",
  );
  await writeJsonAtomically(filePath, output);
  return filePath;
}

async function writeAuthConfig(supportEmail) {
  const rootConfigPath = path.join(projectRoot, "firebase.json");
  const rootConfig = JSON.parse(await readFile(rootConfigPath, "utf8"));
  const auth = rootConfig.auth;
  if (
    !auth ||
    !Array.isArray(auth.authorizedDomains) ||
    !auth.providers?.googleSignIn
  ) {
    throw new Error(
      "firebase.json must retain its Auth domains and Google provider config before provisioning.",
    );
  }

  rootConfig.auth = {
    ...auth,
    providers: {
      emailPassword: true,
      googleSignIn: {
        ...auth.providers.googleSignIn,
        supportEmail,
      },
    },
  };
  const filePath = path.join(projectRoot, "outputs", "firebase-provision.json");
  await writeJsonAtomically(filePath, rootConfig);
  return filePath;
}

async function provision(projectId, requestedSupportEmail) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error("Use Node.js 22.13 or newer for this project helper.");
  }
  if (!PROJECT_ID_PATTERN.test(projectId) || projectId.startsWith("demo-")) {
    throw new Error(
      "Use a valid non-demo project ID: 6–30 characters, lowercase, starting with a letter, ending with a letter or number.",
    );
  }
  const activeEmail = await activeCliEmail();
  const supportEmail = requestedSupportEmail
    ? requestedSupportEmail.toLowerCase()
    : activeEmail;
  if (!EMAIL_PATTERN.test(supportEmail)) {
    throw new Error("Supply a valid support email address.");
  }
  if (supportEmail !== activeEmail) {
    throw new Error(
      `The support email must match the active Firebase CLI account (${activeEmail}). Run firebase login:use first if needed.`,
    );
  }

  const actualProjectId = await ensureProject(projectId);
  await persistProjectAlias(actualProjectId);
  const appId = await ensureWebApp(actualProjectId);
  const webConfigPath = await writeWebConfig(actualProjectId, appId);
  const authConfigPath = await writeAuthConfig(supportEmail);
  await firebase(
    [
      "deploy",
      "--only",
      "auth",
      "--project",
      actualProjectId,
      "--config",
      authConfigPath,
    ],
    { json: true },
  );

  process.stdout.write(
    `Firebase Auth is configured for ${actualProjectId}.\n` +
      `Web client settings: ${path.relative(projectRoot, webConfigPath)}\n` +
      `Auth deployment config: ${path.relative(projectRoot, authConfigPath)}\n` +
      "Copy the four runtime binding values into the hosting environment using your normal secret/configuration workflow.\n",
  );
}

function printHelp() {
  process.stdout.write(
    "Usage: node scripts/provision-firebase.mjs --project-id <id> [--support-email <active-cli-account-email>]\n" +
      "Creates or reuses the exact non-demo Firebase project, ensures one Web App, deploys only Auth config, and writes ignored local outputs.\n",
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (!options.projectId) throw new Error("--project-id is required.");
  await provision(options.projectId, options.supportEmail);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Firebase provisioning failed."}\n`,
    );
    process.exitCode = 1;
  });
}
