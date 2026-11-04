import { MediaContribute } from "@/components/MediaContribute";
import { PhotographerAccess, SubmissionsClosed } from "@/components/PhotographerAccess";
import { requireArea } from "@/lib/access";
import { roleRow } from "@/lib/request/roles";
import { deploymentRolesSource } from "@/lib/request/worker";

export const dynamic = "force-dynamic";

export default async function ContributePage() {
  const access = await requireArea("photographer");
  const viewer = access.kind === "granted" ? access.viewer : null;

  // Photographer submissions live in the game backend and Bunny only (D-2 amended 2026-11-04). The
  // website's own proposal form and "your earlier proposals" are closed to members in every mode.
  if (deploymentRolesSource() !== "backend") return <SubmissionsClosed signedIn={!!viewer} />;

  if (!viewer) return <SubmissionsClosed signedIn={false} signInRequired />;
  if (viewer.photographer) return <MediaContribute sessionKey={viewer.sessionKey} />;
  return (
    <PhotographerAccess
      row={roleRow(viewer.roles, "photographer")}
      status={viewer.roles.status}
      mock={viewer.roles.status === "ok" && viewer.roles.source === "mock"}
      emailVerified={viewer.user.emailVerified}
      sessionKey={viewer.sessionKey}
      hideEarlier
    />
  );
}
