/**
 * The Admin that belongs to this website, as `https://<host>/admin` (decision I-1: the Admin is its own repo
 * and host). Derived from the website's host: `<domain>` and `www.<domain>` → `admin.<domain>`,
 * `dev.<domain>` → `dev.admin.<domain>`. Local and preview hosts (localhost, `*.localhost`, `*.test`, IP
 * addresses, single labels) have no known Admin, so the answer is null and callers leave the link out.
 * Links only: nothing here authorizes anything; the Admin checks staff roles itself.
 */
export function adminWorkspaceUrl(host: string | null | undefined): string | null {
  const name = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) return null;
  if (/^\d+(\.\d+){3}$/.test(name) || /\.(localhost|test|local)$/.test(name)) return null;
  if (name.startsWith("admin.") || name.startsWith("dev.admin.")) return null;
  let admin: string;
  if (name.startsWith("dev.")) admin = `dev.admin.${name.slice(4)}`;
  else if (name.startsWith("www.")) admin = `admin.${name.slice(4)}`;
  else admin = `admin.${name}`;
  return `https://${admin}/admin`;
}

/** The Admin for the page the browser is on, or null (server render, or a local host). */
export function currentAdminWorkspaceUrl(): string | null {
  return typeof window === "undefined" ? null : adminWorkspaceUrl(window.location.host);
}
