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
