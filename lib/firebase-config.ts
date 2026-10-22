import { env } from "cloudflare:workers";

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

export type FirebaseSettings = {
  configured: boolean;
  config: FirebaseClientConfig | null;
  emulatorUrl: string | null;
};

const ENV_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_WEB_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_APP_ID",
  "FIREBASE_AUTH_EMULATOR_HOST",
] as const;

function isDevelopmentBuild(): boolean {
  return typeof import.meta.env !== "undefined" && import.meta.env.DEV === true;
}

function loopbackHostname(value: string): boolean {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "") &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1")
    );
  } catch {
    return false;
  }
}

function parseEmulatorUrl(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    const port = Number(url.port);
    if (
      url.protocol !== "http:" ||
      !loopbackHostname(url.host) ||
      !port ||
      port < 1 ||
      port > 65535 ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Read public Firebase client settings from Cloudflare's server environment. */
export function firebaseSettings(host: string): FirebaseSettings {
  const bindings = env as unknown as Record<string, string | undefined>;
  const values = ENV_KEYS.reduce<Record<string, string | undefined>>(
    (all, key) => {
      const value = bindings[key];
      all[key] =
        typeof value === "string" && value.trim() ? value.trim() : undefined;
      return all;
    },
    {},
  );
  const projectId = values.FIREBASE_PROJECT_ID;
  const apiKey = values.FIREBASE_WEB_API_KEY;
  const authDomain = values.FIREBASE_AUTH_DOMAIN;
  const appId = values.FIREBASE_APP_ID;
  const emulatorHost = values.FIREBASE_AUTH_EMULATOR_HOST;
  const configured = !!(projectId && apiKey && authDomain && appId);

  if (!configured || !projectId || !apiKey || !authDomain || !appId) {
    return { configured: false, config: null, emulatorUrl: null };
  }

  const development = isDevelopmentBuild();
  const demoProject = projectId.startsWith("demo-");
  if (demoProject && !development) {
    throw new Error(
      "Firebase demo projects are only allowed in development builds.",
    );
  }

  let emulatorUrl: string | null = null;
  if (emulatorHost) {
    const candidate = parseEmulatorUrl(emulatorHost);
    const eligible =
      development &&
      demoProject &&
      loopbackHostname(host) &&
      candidate !== null;
    if (!eligible) {
      throw new Error(
        "Firebase Auth emulator settings are not allowed for this host or build.",
      );
    }
    emulatorUrl = candidate;
  }

  return {
    configured: true,
    config: { apiKey, authDomain, projectId, appId },
    emulatorUrl,
  };
}
