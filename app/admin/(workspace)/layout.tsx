import type { ReactNode } from "react";
import { PublicShell } from "@/components/PublicShell";
import { AccessGate, AccountActions } from "@/components/AccessGate";
import { requireArea } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Guards everything in the editorial workspace. Signed-out visitors are sent to /admin/sign-in. */
export default async function AdminWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireArea("admin");
  if (access.kind === "denied" && access.viewer.roles.status !== "ok")
    return (
      <PublicShell>
        <AccessGate alert title="Access can't be checked" actions={<AccountActions reloadLabel="Try again" />}>
          <p>
            {access.viewer.roles.status === "not-connected"
              ? "Editor access is managed by the game backend, which is not connected to this website yet."
              : "Editor access couldn't be checked because the game backend didn't answer. Please try again in a moment."}
          </p>
          <p>Signed in as {access.viewer.principal.displayName}.</p>
        </AccessGate>
      </PublicShell>
    );
  if (access.kind === "denied")
    return (
      <PublicShell>
        <AccessGate alert title="Access unavailable" actions={<AccountActions />}>
          <p>
            This account does not have permission to use the editorial
            workspace.
          </p>
          <p>Signed in as {access.viewer.principal.displayName}.</p>
        </AccessGate>
      </PublicShell>
    );
  return children;
}
