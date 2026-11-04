import SubmissionForm from "@/components/SubmissionForm";
import { PhotographerAccess } from "@/components/PhotographerAccess";
import { requireArea } from "@/lib/access";
import { roleRow } from "@/lib/request/roles";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    category?: string | string[];
    game?: string | string[];
    view?: string | string[];
  }>;
};

export default async function ContributePage({ searchParams }: PageProps) {
  const [access, params] = await Promise.all([
    requireArea("photographer"),
    searchParams,
  ]);
  const category = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const game = Array.isArray(params.game) ? params.game[0] : params.game;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const viewer = access.kind === "granted" ? access.viewer : null;

  // Only an approved photographer gets the new-photo form; everyone else sees their access state.
  // Your own earlier submissions stay readable (?view=mine) whatever your role is now.
  if (viewer && !viewer.photographer && view !== "mine")
    return (
      <PhotographerAccess
        row={roleRow(viewer.roles, "photographer")}
        status={viewer.roles.status}
        mock={viewer.roles.status === "ok" && viewer.roles.source === "mock"}
        emailVerified={viewer.user.emailVerified}
        sessionKey={viewer.sessionKey}
      />
    );

  return (
    <SubmissionForm
      user={
        viewer
          ? {
              displayName: viewer.principal.displayName,
              email: viewer.user.email,
              sessionKey: viewer.sessionKey,
            }
          : null
      }
      initialCategory={category}
      initialGame={game}
      initialView={view === "mine" ? "mine" : "new"}
      demoMode={process.env.NODE_ENV !== "production"}
    />
  );
}
