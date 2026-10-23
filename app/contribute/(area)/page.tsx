import SubmissionForm from "@/components/SubmissionForm";
import { requireArea } from "@/lib/access";

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
