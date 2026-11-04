/**
 * Roles come from the game backend only (Backend ADR-0002, openapi 0.15.0). The website keeps no
 * allowlist: an account is an admin or a photographer when its own `account_roles` row is
 * `active`, read with the member's own Firebase ID token. Nothing here grants access when the
 * backend cannot be read: that is reported, and every check fails closed. Relative imports only,
 * so this loads under plain `node --test`.
 */
import { z } from "zod";
import { BackendError, BackendNotConnected, type BackendClient } from "./backend.ts";

export const roleNames = ["player", "photographer", "admin"] as const;
/** `blocked` is photographer only and lasting: the account cannot ask again until an admin unblocks it. */
export const roleStates = ["pending", "active", "rejected", "revoked", "blocked"] as const;
export type RoleName = (typeof roleNames)[number];
export type RoleState = (typeof roleStates)[number];

const roleName = z.enum(roleNames);
const roleState = z.enum(roleStates);
const revision = z.number().int().min(1);

/** openapi `OwnRole`. */
export const ownRoleSchema = z
  .object({
    role: roleName,
    state: roleState,
    revision,
    requestedAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .strict();
export type OwnRole = z.infer<typeof ownRoleSchema>;
/** openapi `OwnRolesEnvelope`. */
export const ownRolesEnvelopeSchema = z.object({ roles: z.array(ownRoleSchema) }).strict();
/** openapi `PhotographerRequestResult`. */
export const photographerRequestResultSchema = z.object({ role: ownRoleSchema, changed: z.boolean() }).strict();

/**
 * openapi `AdminRoleRow`. Every email is for display to admins only, never for authorisation.
 * `email` is the one to show: the typed `grantEmail` when set, else the verified `requestEmail`;
 * `emailSource: "typed"` means an admin typed it and it is unverified.
 */
export const adminRoleRowSchema = z
  .object({
    principal: z.string(),
    role: roleName,
    state: roleState,
    revision,
    requestedAt: z.string(),
    decidedAt: z.string().nullable(),
    decidedBy: z.string().nullable(),
    note: z.string().nullable(),
    requestEmail: z.string().nullable(),
    grantEmail: z.string().nullable(),
    email: z.string().nullable(),
    emailSource: z.enum(["verified_at_request", "typed"]).nullable(),
  })
  .strict();
export type AdminRoleRow = z.infer<typeof adminRoleRowSchema>;
/** openapi `RoleRequestList`. */
export const roleRequestListSchema = z
  .object({ requests: z.array(adminRoleRowSchema), nextCursor: z.string().nullable() })
  .strict();
export type RoleRequestList = z.infer<typeof roleRequestListSchema>;
/** openapi `AdminRoleEnvelope`. */
export const adminRoleEnvelopeSchema = z.object({ role: adminRoleRowSchema }).strict();

/** What the website knows about the caller's roles for this request. */
export type RoleSnapshot =
  /** `source: "mock"`: set by the deployment's env lists, not the backend. Nothing can be requested or decided. */
  | { status: "ok"; roles: OwnRole[]; source?: "mock" }
  /** No `GAME_API_BASE_URL`: nobody holds a role on this deployment. */
  | { status: "not-connected" }
  /** The backend could not be read or answered off the contract. */
  | { status: "unavailable" };

export const noRoles: RoleSnapshot = { status: "ok", roles: [] };

/**
 * Where roles come from, set by `ROLES_SOURCE`. "backend" reads the game backend; anything else
 * (including unset) is "mock": a stopgap until the backend is hosted where the deployment can reach it.
 */
export type RolesSource = "backend" | "mock";
export function rolesSource(value: string | undefined): RolesSource {
  return value?.trim().toLowerCase() === "backend" ? "backend" : "mock";
}

export function parseEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Mock roles from the deployment's env lists (`MOCK_ADMIN_EMAILS`, `MOCK_PHOTOGRAPHER_EMAILS`).
 * Only a verified email matches; the demo account is excluded by the principal as always.
 */
export function mockRoles(
  user: { email: string; emailVerified: boolean },
  lists: { admins: string[]; photographers: string[] },
): RoleSnapshot {
  const roles: OwnRole[] = [];
  const email = user.email.trim().toLowerCase();
  const row = (role: RoleName): OwnRole => ({
    role,
    state: "active",
    revision: 1,
    requestedAt: "1970-01-01T00:00:00.000Z",
    decidedAt: "1970-01-01T00:00:00.000Z",
  });
  if (user.emailVerified && email) {
    if (lists.photographers.includes(email)) roles.push(row("photographer"));
    if (lists.admins.includes(email)) roles.push(row("admin"));
  }
  return { status: "ok", roles, source: "mock" };
}

/** The principal fields the backend accepts as `AccountPrincipal` (openapi 0.13.0). */
export const accountPrincipalPattern = /^firebase:[A-Za-z0-9-]{1,64}:[^:/\s\u0000-\u001f]{1,128}$/;

/** `GET /v1/me/roles` as the member. Never throws for a backend problem. */
export async function readOwnRoles(client: BackendClient): Promise<RoleSnapshot> {
  try {
    const parsed = ownRolesEnvelopeSchema.safeParse(await client.getJson("/v1/me/roles"));
    return parsed.success ? { status: "ok", roles: parsed.data.roles } : { status: "unavailable" };
  } catch (error) {
    if (error instanceof BackendNotConnected) return { status: "not-connected" };
    if (error instanceof BackendError) return { status: "unavailable" };
    throw error;
  }
}

export function roleRow(snapshot: RoleSnapshot, role: RoleName): OwnRole | null {
  return snapshot.status === "ok" ? (snapshot.roles.find((r) => r.role === role) ?? null) : null;
}

export function holdsRole(snapshot: RoleSnapshot, role: RoleName) {
  return roleRow(snapshot, role)?.state === "active";
}

/** The admin actions the website offers. Granting admin stays with the backend's operator command. */
export const roleActions = {
  approve: ["photographer"],
  reject: ["photographer"],
  block: ["photographer"],
  unblock: ["photographer"],
  revoke: ["photographer", "admin"],
} as const satisfies Record<string, readonly RoleName[]>;
export type RoleAction = keyof typeof roleActions;

export function isRoleAction(action: string, role: string): action is RoleAction {
  return Object.hasOwn(roleActions, action) && (roleActions[action as RoleAction] as readonly string[]).includes(role);
}

/** The backend path for an admin decision on one account's role row. */
export function roleActionPath(principal: string, role: RoleName, action: RoleAction) {
  return `/v1/admin/accounts/${encodeURIComponent(principal)}/roles/${role}/${action}`;
}

/** The backend path for correcting an admin row's typed email. */
export function adminEmailPath(principal: string) {
  return `/v1/admin/accounts/${encodeURIComponent(principal)}/roles/admin/email`;
}
